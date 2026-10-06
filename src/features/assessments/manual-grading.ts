import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/services/supabase/admin";
import { gradeWithManualScores, isManualType, type GradeResult } from "./grading";
import type { QuestionType } from "./learner";
import { ATTEMPT_COLUMNS, loadKeyedQuestions, type AttemptRow, type KeyedQuestion } from "./server";

// Instructor-side reads for grading essay/coding attempts (T-252). Server-only.

export interface AttemptQueueRow {
  attemptId: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  learnerName: string;
  attemptNumber: number;
  submittedAt: string;
  status: "submitted" | "graded";
  percent: number | null;
  passed: boolean | null;
}

/** Attempts to grade on the caller's own courses, awaiting grading first, oldest first. */
export async function getAttemptGradingQueue(supabase: SupabaseClient): Promise<AttemptQueueRow[]> {
  const { data, error } = await supabase.rpc("instructor_assessment_grading_queue");
  if (error) throw new Error(`instructor_assessment_grading_queue failed: ${error.message}`);
  return (
    (data ?? []) as {
      attempt_id: string;
      assessment_id: string;
      assessment_title: string;
      course_id: string;
      course_title: string;
      learner_name: string;
      attempt_number: number;
      submitted_at: string;
      status: string;
      percent: number | null;
      passed: boolean | null;
    }[]
  ).map((r) => ({
    attemptId: r.attempt_id,
    assessmentId: r.assessment_id,
    assessmentTitle: r.assessment_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    learnerName: r.learner_name,
    attemptNumber: r.attempt_number,
    submittedAt: r.submitted_at,
    status: r.status === "graded" ? "graded" : "submitted",
    percent: r.percent === null ? null : Number(r.percent),
    passed: r.passed,
  }));
}

export interface GradingQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  manual: boolean;
  /** The learner's answer: option labels for choice questions, the text otherwise. */
  answer: string;
  /** Auto-graded questions only. */
  correct: boolean | null;
  earned: number;
  /** Manual questions: the saved mark, if graded. */
  manualPoints: number | null;
  manualFeedback: string;
}

export interface AttemptForGrading {
  attempt: AttemptRow;
  assessmentId: string;
  assessmentTitle: string;
  passMark: number;
  courseId: string;
  courseSlug: string;
  questions: GradingQuestion[];
  /** Keyed questions, for re-grading on save. */
  keyed: KeyedQuestion[];
  grade: GradeResult;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A submitted attempt with everything the grading screen needs; null unless the caller owns the
 * course. (RLS also lets the learner and staff read the attempt, so ownership is checked here.)
 */
export async function getAttemptForGrading(
  supabase: SupabaseClient,
  userId: string,
  attemptId: string,
): Promise<AttemptForGrading | null> {
  if (typeof attemptId !== "string" || !UUID.test(attemptId)) return null;
  const { data: row } = await supabase
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("id", attemptId)
    .maybeSingle();
  if (!row) return null;
  const attempt = row as unknown as AttemptRow;
  if (attempt.status === "in_progress") return null;

  const { data: a } = await supabase
    .from("assessments")
    .select(
      "id, title, pass_mark, course_versions!inner(course_id, courses!course_versions_course_id_fkey(slug, instructor_id))",
    )
    .eq("id", attempt.assessment_id)
    .maybeSingle();
  if (!a) return null;
  const version = a.course_versions as unknown as {
    course_id: string;
    courses: { slug: string; instructor_id: string };
  };
  if (version.courses.instructor_id !== userId) return null;

  // Ownership is proven: read the keys and option labels with the service role.
  const admin = createAdminClient();
  const keyed = await loadKeyedQuestions(admin, a.id as string);
  if (!keyed.some((q) => isManualType(q.type))) return null;
  const { data: options } = await admin
    .from("assessment_options")
    .select("id, label")
    .in(
      "question_id",
      keyed.map((q) => q.id),
    );
  const label = (id: string) =>
    (options ?? []).find((o) => o.id === id)?.label ?? "(removed option)";

  const manual = attempt.manual_scores ?? {};
  const grade = gradeWithManualScores(keyed, attempt.answers, a.pass_mark as number, manual);
  const questions = keyed.map((q): GradingQuestion => {
    const raw = attempt.answers[q.id];
    const answer =
      raw === undefined || raw === "" || (Array.isArray(raw) && raw.length === 0)
        ? ""
        : Array.isArray(raw)
          ? raw.map(label).join(", ")
          : q.type === "mcq" || q.type === "true_false"
            ? label(raw)
            : raw;
    const r = grade.results.find((x) => x.questionId === q.id)!;
    const isManual = isManualType(q.type);
    return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      manual: isManual,
      answer,
      correct: isManual ? null : r.correct,
      earned: r.earned,
      manualPoints: isManual ? (manual[q.id]?.points ?? null) : null,
      manualFeedback: isManual ? (manual[q.id]?.feedback ?? "") : "",
    };
  });

  return {
    attempt,
    assessmentId: a.id as string,
    assessmentTitle: a.title as string,
    passMark: a.pass_mark as number,
    courseId: version.course_id,
    courseSlug: version.courses.slug,
    questions,
    keyed,
    grade,
  };
}

export type GradingKind = "assignments" | "assessments";

/** `?kind=assessments` switches the grading queue to essay/coding attempts. */
export function parseGradingKind(raw: string | string[] | undefined): GradingKind {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "assessments" ? "assessments" : "assignments";
}

export function filterAttemptQueue(
  rows: AttemptQueueRow[],
  filter: "pending" | "graded" | "all",
): AttemptQueueRow[] {
  return filter === "all"
    ? rows
    : rows.filter((r) => (filter === "graded" ? r.status === "graded" : r.status !== "graded"));
}
