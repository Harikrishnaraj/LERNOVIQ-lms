import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatFailureReason, ChatProvider } from "@/services/ai";
import { searchKnowledge, type RetrievedPassage } from "@/features/knowledge/retrieval";
import { getMyLearning } from "@/features/my-learning/queries";
import { log } from "@/lib/log";
import { getTutorMode, hasTutorAccess, validateQuestion, type TutorMode } from "./policy";
import { getAiSettings } from "./settings";
import {
  HISTORY_MESSAGES,
  NO_SOURCES_ANSWER,
  buildTutorMessages,
  parseCitations,
  type HistoryMessage,
  type TutorSource,
} from "./tutor-prompt";
import { runChatTurn } from "./usage";

// The learner AI Tutor (T-201, T-224, F-701, RAG_PLAN §6). Every question passes, in order: the
// admin's platform settings (kill switch, ADR-045), the admin's per-user switch (ADR-043), input
// checks, the rate limits and the daily cap, enrollment in the course, the assessment policy
// (hint-only), then permission-aware retrieval (F-801) with the learner's own session. Only then is
// the provider called (with the admin's model and answer length), and the answer is stored with
// the sources it cited.

/** Passages sent to the model per question. */
export const TUTOR_PASSAGES = 6;
/** The daily cap counts questions over a rolling 24 hours. */
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TutorSourceView extends TutorSource {
  /** Link to the cited lesson; null for a document. */
  href: string | null;
}

/** One message as the chat shows it. */
export interface TutorChatEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: TutorSourceView[];
  /** No lesson backs this answer: offer the course discussion (PRD §12). */
  escalate: boolean;
  /** The provider stopped at the length limit. */
  truncated: boolean;
  /** The provider failed for this turn (history only). */
  failed: boolean;
}

export type TutorErrorCode =
  | "disabled"
  | "no_access"
  | "invalid"
  | "rate_limited"
  | "daily_limit"
  | "not_enrolled"
  | "not_found"
  | "timeout"
  | "busy"
  | "unavailable";

export type TutorReply =
  | { ok: true; conversationId: string; mode: TutorMode; answer: TutorChatEntry }
  | { ok: false; code: TutorErrorCode; error: string; conversationId?: string };

export interface TutorDeps {
  /** The learner's own session: access, enrollment, mode and retrieval all run as the learner. */
  supabase: SupabaseClient;
  /** Service-role client: reads the AI settings and records the turn (no client writes). */
  db: SupabaseClient;
  /** The chat provider for the admin's chosen model (null: the server default). */
  provider: (model: string | null) => ChatProvider;
  userId: string;
  /** Burst limit and daily cap (checkTutorAllowance). */
  allow: () => Promise<boolean>;
}

export interface TutorQuestion {
  question: unknown;
  courseId: unknown;
  lessonId?: unknown;
  conversationId?: unknown;
}

const MESSAGES: Record<TutorErrorCode, string> = {
  disabled:
    "The AI Tutor is turned off for everyone right now. Your administrator can turn it back on.",
  daily_limit: "You've reached today's limit of AI Tutor questions. Try again tomorrow.",
  no_access: "The AI Tutor isn't turned on for your account. Ask an administrator if you need it.",
  invalid: "Type a question first.",
  rate_limited:
    "You've asked a lot of questions in a short time. Wait a few minutes, then try again.",
  not_enrolled: "You can ask the AI Tutor about courses you're enrolled in.",
  not_found: "This conversation is no longer available. Start a new one.",
  timeout: "The AI Tutor took too long to answer. Try asking again.",
  busy: "The AI Tutor is busy right now. Try again in a minute.",
  unavailable: "The AI Tutor isn't available right now. Try again later.",
};

const fail = (
  code: TutorErrorCode,
  conversationId?: string,
  error = MESSAGES[code],
): TutorReply => ({
  ok: false,
  code,
  error,
  ...(conversationId ? { conversationId } : {}),
});

const FAILURE_CODES: Record<ChatFailureReason, TutorErrorCode> = {
  timeout: "timeout",
  rate_limited: "busy",
  not_configured: "unavailable",
  error: "unavailable",
};

export const lessonHref = (courseSlug: string, lessonId: string) =>
  `/learner/courses/${courseSlug}/learn/${lessonId}`;

export function sourceViews(sources: TutorSource[], courseSlug: string): TutorSourceView[] {
  return sources.map((s) => ({
    ...s,
    href: s.lessonId ? lessonHref(courseSlug, s.lessonId) : null,
  }));
}

/** Answers one tutor question. Never throws for expected failures: they come back as ok: false. */
export async function answerTutorQuestion(
  deps: TutorDeps,
  input: TutorQuestion,
): Promise<TutorReply> {
  const { supabase, userId } = deps;

  // One uncached read per question, so an admin's change applies to the very next question.
  const settings = await getAiSettings(deps.db);
  if (!settings) return fail("unavailable");
  if (!settings.tutorEnabled) return fail("disabled");

  if (!(await hasTutorAccess(supabase))) return fail("no_access");

  const checked = validateQuestion(input.question);
  if (!checked.ok) return fail("invalid", undefined, checked.error);
  const question = checked.question;

  const conversationId =
    typeof input.conversationId === "string" && UUID.test(input.conversationId)
      ? input.conversationId
      : null;
  let courseId =
    typeof input.courseId === "string" && UUID.test(input.courseId) ? input.courseId : null;
  let lessonId =
    typeof input.lessonId === "string" && UUID.test(input.lessonId) ? input.lessonId : null;

  // A conversation keeps the course and lesson it started with.
  if (conversationId) {
    const { data: conversation, error } = await supabase
      .from("ai_conversations")
      .select("id, course_id, lesson_id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .eq("feature", "tutor")
      .maybeSingle();
    if (error) return unavailable("conversation_lookup", error.message);
    if (!conversation?.course_id) return fail("not_found");
    courseId = conversation.course_id as string;
    lessonId = (conversation.lesson_id as string | null) ?? null;
  }
  if (!courseId) return fail("not_enrolled");

  if (!(await deps.allow())) return fail("rate_limited", conversationId ?? undefined);

  const asked = await questionsToday(supabase);
  if (asked === null) return fail("unavailable", conversationId ?? undefined);
  if (asked >= settings.dailyQuestionCap) {
    return fail(
      "daily_limit",
      conversationId ?? undefined,
      `You've reached today's limit of ${settings.dailyQuestionCap} AI Tutor questions. Try again tomorrow.`,
    );
  }

  let course: { slug: string; title: string } | undefined;
  try {
    course = (await getMyLearning(supabase)).find((c) => c.courseId === courseId);
  } catch (e) {
    return unavailable("enrollment_lookup", e instanceof Error ? e.message : String(e));
  }
  if (!course) return fail("not_enrolled");

  const lessonTitle = lessonId ? await courseLessonTitle(supabase, courseId, lessonId) : null;
  if (!lessonTitle) lessonId = null;

  const mode: TutorMode = settings.hintOnlyAlways
    ? "hint_only"
    : await getTutorMode(supabase, courseId);

  const history = conversationId ? await recentHistory(supabase, conversationId) : [];
  if (history === null) return unavailable("history_lookup");

  const passages = await retrieve(supabase, courseId, question, [
    [...history].reverse().find((m) => m.role === "user")?.content ?? null,
    lessonTitle,
  ]);
  if (passages === null) return fail("unavailable", conversationId ?? undefined);

  // Nothing in the course matched and there is no earlier answer to build on: say so instead of
  // letting the model guess (TEST_PLAN §15 "unsupported question is handled safely").
  const fixed = passages.length === 0 && !history.some((m) => m.role === "assistant");

  const turn = await runChatTurn({
    db: deps.db,
    provider: deps.provider(settings.tutorModel),
    userId,
    conversationId: conversationId ?? undefined,
    feature: "tutor",
    courseId,
    lessonId,
    context: buildTutorMessages(
      { courseTitle: course.title, lessonTitle, mode, passages },
      history,
    ),
    question,
    maxOutputTokens: settings.maxAnswerTokens,
    ...(fixed
      ? { fixedAnswer: NO_SOURCES_ANSWER }
      : { shapeAnswer: (text: string) => parseCitations(text, passages) }),
  });

  if (!turn.ok) {
    return turn.error === "conversation_not_found" ? fail("not_found") : fail("unavailable");
  }
  if (turn.result && !turn.result.ok) {
    return fail(FAILURE_CODES[turn.result.reason], turn.conversationId);
  }
  // A reasoning model can spend its whole budget thinking and return no text.
  if (!turn.answer.text) {
    return fail(
      "unavailable",
      turn.conversationId,
      "The AI Tutor couldn't finish an answer. Try asking again, perhaps more briefly.",
    );
  }

  const sources = sourceViews(turn.answer.sources as TutorSource[], course.slug);
  return {
    ok: true,
    conversationId: turn.conversationId,
    mode,
    answer: {
      id: crypto.randomUUID(),
      role: "assistant",
      text: turn.answer.text,
      sources,
      escalate: sources.length === 0,
      truncated: turn.result?.ok === true && turn.result.finishReason === "length",
      failed: false,
    },
  };
}

function unavailable(step: string, message?: string): TutorReply {
  log.error("ai.tutor.lookup_failed", { step, message });
  return fail("unavailable");
}

/** Questions the learner asked the tutor in the last 24 hours (their own, via auth.uid()). */
async function questionsToday(supabase: SupabaseClient): Promise<number | null> {
  const { data, error } = await supabase.rpc("ai_tutor_questions_since", {
    p_since: new Date(Date.now() - DAILY_WINDOW_MS).toISOString(),
  });
  if (error || typeof data !== "number") {
    log.error("ai.tutor.daily_count_failed", { message: error?.message });
    return null;
  }
  return data;
}

/** The lesson's title when the learner may read it and it belongs to the course; else null. */
async function courseLessonTitle(
  supabase: SupabaseClient,
  courseId: string,
  lessonId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("lessons")
    .select("title, course_sections!inner(course_versions!inner(course_id))")
    .eq("id", lessonId)
    .eq("course_sections.course_versions.course_id", courseId)
    .maybeSingle();
  return (data?.title as string | undefined) ?? null;
}

/** The conversation's latest successful turns, oldest first; null when the read fails. */
async function recentHistory(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<HistoryMessage[] | null> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("role, content, status")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_MESSAGES);
  if (error) return null;
  return ((data ?? []) as { role: "user" | "assistant"; content: string; status: string }[])
    .filter((m) => m.status === "ok" && m.content)
    .map(({ role, content }) => ({ role, content }))
    .reverse();
}

/**
 * Keyword search in the course as the learner. A follow-up ("can you explain that again?") rarely
 * shares words with the lesson, so when the question alone finds nothing it is searched again
 * together with the previous question or the current lesson's title. Null when search fails.
 */
async function retrieve(
  supabase: SupabaseClient,
  courseId: string,
  question: string,
  fallbacks: (string | null)[],
): Promise<RetrievedPassage[] | null> {
  const first = await searchKnowledge(supabase, question, { courseId, limit: TUTOR_PASSAGES });
  if (!first.ok) return null;
  const extra = fallbacks.filter(Boolean).join(" ");
  if (first.passages.length > 0 || !extra) return first.passages;
  const second = await searchKnowledge(supabase, `${question} ${extra}`, {
    courseId,
    limit: TUTOR_PASSAGES,
  });
  return second.ok ? second.passages : null;
}
