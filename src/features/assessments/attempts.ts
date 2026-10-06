"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { createAdminClient } from "@/services/supabase/admin";
import { sanitizeAnswers } from "./answers";
import {
  computeExpiry,
  decideStart,
  isExpired,
  isPastGrace,
  type Answers,
} from "./grading";
import {
  ATTEMPT_COLUMNS,
  finalizeAttempt,
  loadKeyedQuestions,
  toAnswerable,
  type AttemptRow,
} from "./server";

export type StartResult = { attemptId: string } | { error: string };
export type SaveResult = { saved: true } | { error: string };
export type SubmitResult =
  | { submitted: true; status: "graded" | "submitted"; percent: number; passed: boolean | null }
  | { error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_AVAILABLE = "This assessment is not available.";

interface AssessmentInfo {
  id: string;
  version_id: string;
  pass_mark: number;
  max_attempts: number | null;
  time_limit_minutes: number | null;
}

// Authenticates the caller with the request-scoped client and resolves their enrollment for the
// assessment version. Only then is the service-role client handed out.
async function authorize(assessmentId: string) {
  if (typeof assessmentId !== "string" || !UUID.test(assessmentId)) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, version_id, pass_mark, max_attempts, time_limit_minutes")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment) return null;

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", user.id)
    .eq("version_id", assessment.version_id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (!enrollment) return null;

  return {
    userId: user.id,
    enrollmentId: enrollment.id as string,
    assessment: assessment as AssessmentInfo,
    admin: createAdminClient(),
  };
}

async function loadOwnAttempt(admin: ReturnType<typeof createAdminClient>, attemptId: string, userId: string) {
  if (typeof attemptId !== "string" || !UUID.test(attemptId)) return null;
  const { data } = await admin
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as AttemptRow | null) ?? null;
}

/** Starts a new attempt (or resumes the one in progress), enforcing the retry rules. */
export async function startAttempt(assessmentId: string): Promise<StartResult> {
  const ctx = await authorize(assessmentId);
  if (!ctx) return { error: NOT_AVAILABLE };
  const { admin, assessment, enrollmentId, userId } = ctx;

  const { data: existing } = await admin
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("assessment_id", assessment.id)
    .eq("enrollment_id", enrollmentId);
  const attempts = (existing ?? []) as AttemptRow[];

  const inProgress = attempts.find((a) => a.status === "in_progress");
  if (inProgress) {
    if (!isExpired(inProgress.expires_at, new Date())) return { attemptId: inProgress.id };
    // The deadline passed while away: grade what was saved, then fall through to the retry rules.
    const done = await finalizeAttempt(admin, inProgress, assessment.pass_mark, inProgress.answers);
    attempts.splice(attempts.indexOf(inProgress), 1, done.attempt);
  }

  const decision = decideStart(attempts, assessment.max_attempts);
  if (!decision.ok) {
    return {
      error:
        decision.reason === "no_attempts_left"
          ? "You have used all your attempts for this assessment."
          : decision.reason === "awaiting_review"
            ? "Your last attempt is waiting for your instructor to grade it."
            : "You already have an attempt in progress.",
    };
  }

  const now = new Date();
  const { data, error } = await admin
    .from("assessment_attempts")
    .insert({
      assessment_id: assessment.id,
      enrollment_id: enrollmentId,
      user_id: userId,
      attempt_number: decision.attemptNumber,
      expires_at: computeExpiry(now, assessment.time_limit_minutes),
    })
    .select("id")
    .single();
  if (error) {
    // Unique violation = a parallel request started the same attempt number: resume that one.
    if (error.code === "23505") {
      const { data: again } = await admin
        .from("assessment_attempts")
        .select("id")
        .eq("assessment_id", assessment.id)
        .eq("enrollment_id", enrollmentId)
        .eq("status", "in_progress")
        .maybeSingle();
      if (again) return { attemptId: again.id as string };
    }
    return { error: "We could not start the assessment. Please try again." };
  }

  revalidatePath("/learner/courses", "layout");
  return { attemptId: data.id as string };
}

/** Autosave: replaces the stored answers of an in-progress attempt with the sanitized input. */
export async function saveAnswers(
  assessmentId: string,
  attemptId: string,
  answers: unknown,
): Promise<SaveResult> {
  const ctx = await authorize(assessmentId);
  if (!ctx) return { error: NOT_AVAILABLE };
  const attempt = await loadOwnAttempt(ctx.admin, attemptId, ctx.userId);
  if (!attempt || attempt.assessment_id !== ctx.assessment.id) return { error: NOT_AVAILABLE };
  if (attempt.status !== "in_progress") return { error: "This attempt has already been submitted." };
  if (isPastGrace(attempt.expires_at, new Date())) return { error: "Time is up for this attempt." };

  const questions = await loadKeyedQuestions(ctx.admin, ctx.assessment.id);
  const clean = sanitizeAnswers(toAnswerable(questions), answers);
  const { error } = await ctx.admin
    .from("assessment_attempts")
    .update({ answers: clean })
    .eq("id", attempt.id)
    .eq("status", "in_progress");
  if (error) return { error: "We could not save your answers." };
  return { saved: true };
}

/**
 * Submits and grades an attempt on the server. `finalAnswers` (the client latest state) is used
 * only while the attempt is within its time limit (+ grace); afterwards the last autosaved
 * answers are graded instead.
 */
export async function submitAttempt(
  assessmentId: string,
  attemptId: string,
  finalAnswers?: unknown,
): Promise<SubmitResult> {
  const ctx = await authorize(assessmentId);
  if (!ctx) return { error: NOT_AVAILABLE };

  const ip = await clientIp();
  if (!(await rateLimit("assessment-submit", ip, ctx.userId))) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const attempt = await loadOwnAttempt(ctx.admin, attemptId, ctx.userId);
  if (!attempt || attempt.assessment_id !== ctx.assessment.id) return { error: NOT_AVAILABLE };
  if (attempt.status !== "in_progress") {
    return {
      submitted: true,
      status: attempt.status === "graded" ? "graded" : "submitted",
      percent: Number(attempt.percent ?? 0),
      passed: attempt.passed,
    };
  }

  const late = isPastGrace(attempt.expires_at, new Date());
  const answers: Answers = !late && finalAnswers !== undefined ? (finalAnswers as Answers) : attempt.answers;
  const { attempt: done, grade } = await finalizeAttempt(
    ctx.admin,
    attempt,
    ctx.assessment.pass_mark,
    answers,
  );

  revalidatePath("/learner/courses", "layout");
  revalidatePath("/learner/assessments");
  return {
    submitted: true,
    status: done.status === "graded" ? "graded" : "submitted",
    percent: grade.percent,
    passed: grade.passed,
  };
}
