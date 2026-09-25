import type { SupabaseClient } from "@supabase/supabase-js";

export interface ThreadSummary {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  replies: number;
  votes: number;
  answered: boolean;
  pinned: boolean;
  mine: boolean;
}

export interface ThreadPost {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
  mine: boolean;
  isInstructor: boolean;
  votes: number;
  voted: boolean;
  reported: boolean;
}

export interface ThreadDetail {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  answeredPostId: string | null;
  pinned: boolean;
  mine: boolean;
  canModerate: boolean;
  votes: number;
  voted: boolean;
  reported: boolean;
  posts: ThreadPost[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Threads in every course the caller can access (or one course). RLS-equivalent checks run in the RPC. */
export async function listDiscussions(supabase: SupabaseClient, courseId: string | null = null): Promise<ThreadSummary[]> {
  const { data, error } = await supabase.rpc("list_discussions", { p_course_id: courseId });
  if (error) throw new Error(`list_discussions failed: ${error.message}`);
  return ((data ?? []) as {
    id: string; course_id: string; course_slug: string; course_title: string; title: string; body: string;
    author_name: string; created_at: string; replies: number; votes: number; answered: boolean; pinned: boolean; mine: boolean;
  }[]).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    courseSlug: r.course_slug,
    courseTitle: r.course_title,
    title: r.title,
    body: r.body,
    authorName: r.author_name,
    createdAt: r.created_at,
    replies: r.replies,
    votes: r.votes,
    answered: r.answered,
    pinned: r.pinned,
    mine: r.mine,
  }));
}

/** A thread with replies; null when malformed, unknown, hidden from the caller, or not accessible. */
export async function getDiscussion(supabase: SupabaseClient, id: string): Promise<ThreadDetail | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.rpc("get_discussion", { p_id: id });
  if (error) throw new Error(`get_discussion failed: ${error.message}`);
  if (!data) return null;
  const d = data as Record<string, unknown> & { posts: Record<string, unknown>[] };
  return {
    id: d.id as string,
    courseId: d.course_id as string,
    courseSlug: d.course_slug as string,
    courseTitle: d.course_title as string,
    title: d.title as string,
    body: d.body as string,
    authorName: d.author_name as string,
    createdAt: d.created_at as string,
    answeredPostId: (d.answered_post_id as string | null) ?? null,
    pinned: Boolean(d.pinned),
    mine: Boolean(d.mine),
    canModerate: Boolean(d.can_moderate),
    votes: d.votes as number,
    voted: Boolean(d.voted),
    reported: Boolean(d.reported),
    posts: d.posts.map((p) => ({
      id: p.id as string,
      body: p.body as string,
      authorName: p.author_name as string,
      createdAt: p.created_at as string,
      mine: Boolean(p.mine),
      isInstructor: Boolean(p.is_instructor),
      votes: p.votes as number,
      voted: Boolean(p.voted),
      reported: Boolean(p.reported),
    })),
  };
}

// ---------------------------------------------------------------- pure validation

export const TITLE_MIN = 3;
export const TITLE_MAX = 200;
export const BODY_MAX = 5000;
export const REASON_MIN = 3;
export const REASON_MAX = 1000;

export function validateThread(input: { title: unknown; body: unknown }): { ok: true; title: string; body: string } | { ok: false; errors: { title?: string; body?: string } } {
  const title = typeof input.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  const errors: { title?: string; body?: string } = {};
  if (title.length < TITLE_MIN) errors.title = `Give the discussion a title of at least ${TITLE_MIN} characters.`;
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if (body === "") errors.body = "Write your question or topic.";
  else if (body.length > BODY_MAX) errors.body = `Keep it under ${BODY_MAX.toLocaleString("en-US")} characters.`;
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, title, body };
}

export function validateReply(body: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const text = typeof body === "string" ? body.trim() : "";
  if (text === "") return { ok: false, error: "Write a reply first." };
  if (text.length > BODY_MAX) return { ok: false, error: `Keep the reply under ${BODY_MAX.toLocaleString("en-US")} characters.` };
  return { ok: true, body: text };
}

export function validateReason(reason: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < REASON_MIN) return { ok: false, error: "Tell us briefly what is wrong." };
  if (text.length > REASON_MAX) return { ok: false, error: `Keep it under ${REASON_MAX} characters.` };
  return { ok: true, reason: text };
}

export type ThreadFilter = "all" | "unanswered" | "mine";

export function filterThreads(threads: ThreadSummary[], filter: ThreadFilter, courseSlug: string): ThreadSummary[] {
  return threads.filter((t) => {
    if (courseSlug !== "" && t.courseSlug !== courseSlug) return false;
    if (filter === "unanswered") return !t.answered;
    if (filter === "mine") return t.mine;
    return true;
  });
}
