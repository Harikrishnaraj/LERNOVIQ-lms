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

// ------------------------------------------------------------------ manual grading (T-252)

/** The instructor's mark for one essay/coding question. */
export interface ManualScore {
  points: number;
  feedback: string;
}

/** Keyed by question id; only essay/coding questions appear. */
export type ManualScores = Record<string, ManualScore>;

/**
 * The attempt grade including the instructor's manual scores. Until every manual question has a
 * score the result is the auto-graded one (pending, `passed` null); once all are scored the
 * score, maximum and percent cover every question and `passed` is decided against the pass mark.
 */
export function gradeWithManualScores(
  questions: GradableQuestion[],
  answers: Answers,
  passMark: number,
  manual: ManualScores,
): GradeResult {
  const auto = gradeAttempt(questions, answers, passMark);
  if (!auto.pendingManual) return auto;

  let score = auto.score;
  let maxScore = auto.maxScore;
  let pendingManual = false;
  const results = auto.results.map((r) => {
    const q = questions.find((x) => x.id === r.questionId)!;
    if (!isManualType(q.type)) return r;
    maxScore += q.points;
    const mark = manual[q.id];
    if (!mark) {
      pendingManual = true;
      return r;
    }
    score += mark.points;
    return { questionId: q.id, correct: mark.points === q.points, earned: mark.points };
  });
  if (pendingManual) return { ...auto, results };

  const percent = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
  return { score, maxScore, percent, passed: percent >= passMark, pendingManual: false, results };
}

export const MAX_QUESTION_FEEDBACK = 5000;
export const MAX_OVERALL_FEEDBACK = 10000;

export type ManualGradeCheck =
  | { ok: true; scores: ManualScores; feedback: string }
  | { ok: false; error: string };

/**
 * Validates an instructor's grade: every essay/coding question needs a whole number of points from
 * 0 to its maximum, nothing else may be scored, and feedback is trimmed and length-limited.
 */
export function validateManualGrade(
  questions: Pick<GradableQuestion, "id" | "type" | "points">[],
  input: { points: unknown; feedback: unknown; overall: unknown },
): ManualGradeCheck {
  const points = isRecord(input.points) ? input.points : {};
  const feedback = isRecord(input.feedback) ? input.feedback : {};
  const manual = questions.filter((q) => isManualType(q.type));
  const manualIds = new Set(manual.map((q) => q.id));
  if (Object.keys(points).some((id) => !manualIds.has(id))) {
    return { ok: false, error: "Only essay and coding questions can be graded by hand." };
  }

  const scores: ManualScores = {};
  for (const q of manual) {
    // Numbered by position in the whole assessment, as the grading screen labels them.
    const n = questions.indexOf(q) + 1;
    const p = points[q.id];
    if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > q.points) {
      return { ok: false, error: `Question ${n}: enter a whole number of points from 0 to ${q.points}.` };
    }
    const note = typeof feedback[q.id] === "string" ? (feedback[q.id] as string).trim() : "";
    if (note.length > MAX_QUESTION_FEEDBACK) {
      return { ok: false, error: `Question ${n}: feedback can be at most ${MAX_QUESTION_FEEDBACK} characters.` };
    }
    scores[q.id] = { points: p, feedback: note };
  }

  const overall = typeof input.overall === "string" ? input.overall.trim() : "";
  if (overall.length > MAX_OVERALL_FEEDBACK) {
    return { ok: false, error: `Overall feedback can be at most ${MAX_OVERALL_FEEDBACK} characters.` };
  }
  return { ok: true, scores, feedback: overall };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Completing a course is one-way (the enrollment is marked completed, a certificate may be issued
 * and a course.completed webhook sent), so a re-grade may not turn a passed attempt into a failed
 * one once the learner has completed the course. Returns the reason to refuse, or null.
 */
export function regradeBlockedReason(
  previouslyPassed: boolean | null,
  nowPassed: boolean,
  courseCompleted: boolean,
): string | null {
  if (previouslyPassed === true && !nowPassed && courseCompleted) {
    return "This learner has already completed the course with this pass, so it can't be changed to a fail. An admin can revoke their certificate if needed.";
  }
  return null;
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
  | { ok: false; reason: "in_progress" | "awaiting_review" | "no_attempts_left" };

/**
 * Retry rules: one attempt at a time; no new attempt while one awaits the instructor's grading;
 * at most `maxAttempts` attempts in total (null = unlimited).
 */
export function decideStart(attempts: AttemptSummary[], maxAttempts: number | null): StartDecision {
  if (attempts.some((a) => a.status === "in_progress")) return { ok: false, reason: "in_progress" };
  if (attempts.some((a) => a.status === "submitted")) return { ok: false, reason: "awaiting_review" };
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
