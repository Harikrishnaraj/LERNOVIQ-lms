// Pure grading + attempt-rule logic (no I/O). Runs only on the server, where the answer keys
// are readable; unit-tested in tests/unit/grading.test.ts.

import type { QuestionType } from "./learner";

export type Answer = string | string[];
export type Answers = Record<string, Answer>;

export interface GradableQuestion {
  id: string;
  type: QuestionType;
  points: number;
  correctOptionIds: string[];
  acceptedAnswers: string[];
}

export interface QuestionResult {
  questionId: string;
  /** null = needs manual review (essay / coding). */
  correct: boolean | null;
  earned: number;
}

export interface GradeResult {
  score: number;
  /** Points available from auto-graded questions only. */
  maxScore: number;
  /** 0-100, two decimals. */
  percent: number;
  /** null while any question still awaits manual review. */
  passed: boolean | null;
  pendingManual: boolean;
  results: QuestionResult[];
}

const MANUAL_TYPES: readonly QuestionType[] = ["essay", "coding"];

export const isManualType = (type: QuestionType) => MANUAL_TYPES.includes(type);

export function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function isCorrect(q: GradableQuestion, answer: Answer | undefined): boolean {
  if (answer === undefined) return false;
  switch (q.type) {
    case "mcq":
    case "true_false":
      return (
        typeof answer === "string" &&
        q.correctOptionIds.length === 1 &&
        q.correctOptionIds[0] === answer
      );
    case "multi":
      return (
        Array.isArray(answer) &&
        q.correctOptionIds.length > 0 &&
        sameSet(answer, q.correctOptionIds)
      );
    case "short_answer":
      return (
        typeof answer === "string" &&
        normalizeText(answer) !== "" &&
        q.acceptedAnswers.some((a) => normalizeText(a) === normalizeText(answer))
      );
    default:
      return false;
  }
}

export function gradeAttempt(
  questions: GradableQuestion[],
  answers: Answers,
  passMark: number,
): GradeResult {
  let score = 0;
  let maxScore = 0;
  let pendingManual = false;
  const results: QuestionResult[] = [];

  for (const q of questions) {
    if (isManualType(q.type)) {
      pendingManual = true;
      results.push({ questionId: q.id, correct: null, earned: 0 });
      continue;
    }
    maxScore += q.points;
    const correct = isCorrect(q, answers[q.id]);
    const earned = correct ? q.points : 0;
    score += earned;
    results.push({ questionId: q.id, correct, earned });
  }

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
  return {
    score,
    maxScore,
    percent,
    passed: pendingManual ? null : percent >= passMark,
    pendingManual,
    results,
  };
}

// ------------------------------------------------------------------ attempt rules

export interface AttemptSummary {
  status: "in_progress" | "submitted" | "graded";
  passed: boolean | null;
}

/** Extra seconds allowed past the deadline for network latency on the final submit. */
export const SUBMIT_GRACE_SECONDS = 30;

export function isExpired(expiresAt: string | null, now: Date): boolean {
  return expiresAt !== null && now.getTime() > new Date(expiresAt).getTime();
}

export function isPastGrace(expiresAt: string | null, now: Date): boolean {
  return (
    expiresAt !== null && now.getTime() > new Date(expiresAt).getTime() + SUBMIT_GRACE_SECONDS * 1000
  );
}

export type StartDecision =
  | { ok: true; attemptNumber: number }
  | { ok: false; reason: "in_progress" | "no_attempts_left" };

/**
 * Retry rules: one attempt at a time; at most `maxAttempts` attempts in total (null = unlimited).
 */
export function decideStart(attempts: AttemptSummary[], maxAttempts: number | null): StartDecision {
  if (attempts.some((a) => a.status === "in_progress")) return { ok: false, reason: "in_progress" };
  if (maxAttempts !== null && attempts.length >= maxAttempts) {
    return { ok: false, reason: "no_attempts_left" };
  }
  return { ok: true, attemptNumber: attempts.length + 1 };
}

/** Correct answers/explanations are shown only once retrying can no longer be gamed. */
export function shouldRevealKey(
  attempts: AttemptSummary[],
  maxAttempts: number | null,
): boolean {
  if (attempts.some((a) => a.passed === true)) return true;
  return maxAttempts !== null && attempts.length >= maxAttempts;
}

/** Deadline for a new attempt, or null when there is no time limit. */
export function computeExpiry(startedAt: Date, timeLimitMinutes: number | null): string | null {
  if (timeLimitMinutes === null) return null;
  return new Date(startedAt.getTime() + timeLimitMinutes * 60_000).toISOString();
}
