import type { SupabaseClient } from "@supabase/supabase-js";
import { clientIp, rateLimit } from "@/services/rate-limit";
import { log } from "@/lib/log";

// AI policy service (ARCHITECTURE §18, PRD §12, SECURITY §15/§18). Decides what the tutor may do
// for this learner right now; the tutor feature (T-201) calls it before every question.

/** "hint_only" while a graded assessment in the course is in progress: explain, never answer it. */
export type TutorMode = "full" | "hint_only";

export const MAX_QUESTION_CHARS = 2000;

export type QuestionCheck = { ok: true; question: string } | { ok: false; error: string };

export function validateQuestion(raw: unknown): QuestionCheck {
  if (typeof raw !== "string") return { ok: false, error: "Type a question first." };
  const question = raw.trim();
  if (!question) return { ok: false, error: "Type a question first." };
  if (question.length > MAX_QUESTION_CHARS) {
    return { ok: false, error: `Questions can be up to ${MAX_QUESTION_CHARS} characters.` };
  }
  return { ok: true, question };
}

/**
 * Tutor mode for the signed-in learner in a course. Uses the learner's own session: the SQL
 * function reads auth.uid(), so it can only ever describe the caller. Fails closed to hint_only,
 * because giving away an answer during a graded attempt is worse than an over-cautious hint.
 */
export async function getTutorMode(supabase: SupabaseClient, courseId: string): Promise<TutorMode> {
  const { data, error } = await supabase.rpc("has_active_graded_attempt", {
    p_course_id: courseId,
  });
  if (error) {
    log.error("ai.policy.mode_check_failed", { courseId, message: error.message });
    return "hint_only";
  }
  return data === true ? "hint_only" : "full";
}

/** Burst limit and daily cap per learner (and the per-IP bucket the limiter adds). */
export async function checkTutorAllowance(userId: string): Promise<boolean> {
  const ip = await clientIp();
  return (
    (await rateLimit("ai-tutor", ip, userId)) && (await rateLimit("ai-tutor-daily", ip, userId))
  );
}
