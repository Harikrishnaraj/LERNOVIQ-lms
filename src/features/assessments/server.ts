import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeAnswers, type AnswerableQuestion } from "./answers";
import { gradeAttempt, type Answers, type GradableQuestion, type GradeResult } from "./grading";
import type { QuestionType } from "./learner";

// Server-only helpers (never import from client components): they read answer keys through the
// service-role client passed in by the caller after it authorised the learner.

export interface AttemptRow {
  id: string;
  assessment_id: string;
  enrollment_id: string;
  user_id: string;
  attempt_number: number;
  status: "in_progress" | "submitted" | "graded";
  started_at: string;
  expires_at: string | null;
  submitted_at: string | null;
  answers: Answers;
  score: number | null;
  max_score: number | null;
  percent: number | null;
  passed: boolean | null;
}

export const ATTEMPT_COLUMNS =
  "id, assessment_id, enrollment_id, user_id, attempt_number, status, started_at, expires_at, submitted_at, answers, score, max_score, percent, passed";

export interface KeyedQuestion extends GradableQuestion {
  prompt: string;
  optionIds: string[];
  explanation: string;
}

/** Questions with their answer keys, in display order. admin = service-role client. */
export async function loadKeyedQuestions(
  admin: SupabaseClient,
  assessmentId: string,
): Promise<KeyedQuestion[]> {
  const { data: questions, error } = await admin
    .from("assessment_questions")
    .select("id, type, prompt, points, position")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (error) throw new Error(`questions failed: ${error.message}`);
  const ids = (questions ?? []).map((q) => q.id as string);
  if (ids.length === 0) return [];

  const [{ data: options }, { data: keys }] = await Promise.all([
    admin.from("assessment_options").select("id, question_id, position").in("question_id", ids).order("position"),
    admin
      .from("assessment_answer_keys")
      .select("question_id, correct_option_ids, accepted_answers, explanation")
      .in("question_id", ids),
  ]);

  return (questions ?? []).map((q) => {
    const key = (keys ?? []).find((k) => k.question_id === q.id);
    return {
      id: q.id as string,
      type: q.type as QuestionType,
      prompt: q.prompt as string,
      points: q.points as number,
      optionIds: (options ?? []).filter((o) => o.question_id === q.id).map((o) => o.id as string),
      correctOptionIds: (key?.correct_option_ids as string[] | undefined) ?? [],
      acceptedAnswers: (key?.accepted_answers as string[] | undefined) ?? [],
      explanation: (key?.explanation as string | undefined) ?? "",
    };
  });
}

export const toAnswerable = (qs: KeyedQuestion[]): AnswerableQuestion[] =>
  qs.map((q) => ({ id: q.id, type: q.type, optionIds: q.optionIds }));

/**
 * Grades an in-progress attempt from `answers` and persists the outcome. Idempotent: an attempt
 * that is no longer in_progress is returned unchanged.
 */
export async function finalizeAttempt(
  admin: SupabaseClient,
  attempt: AttemptRow,
  passMark: number,
  answers: Answers,
): Promise<{ attempt: AttemptRow; grade: GradeResult }> {
  const questions = await loadKeyedQuestions(admin, attempt.assessment_id);
  const clean = sanitizeAnswers(toAnswerable(questions), answers);
  const grade = gradeAttempt(questions, clean, passMark);

  if (attempt.status !== "in_progress") return { attempt, grade };

  const { data, error } = await admin
    .from("assessment_attempts")
    .update({
      status: grade.pendingManual ? "submitted" : "graded",
      submitted_at: new Date().toISOString(),
      answers: clean,
      score: grade.score,
      max_score: grade.maxScore,
      percent: grade.percent,
      passed: grade.passed,
    })
    .eq("id", attempt.id)
    .eq("status", "in_progress") // never regrade a finished attempt (double submit)
    .select(ATTEMPT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`finalize failed: ${error.message}`);
  return { attempt: (data as AttemptRow | null) ?? attempt, grade };
}
