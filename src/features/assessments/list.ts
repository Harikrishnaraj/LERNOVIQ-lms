import type { SupabaseClient } from "@supabase/supabase-js";

export type AssessmentStatus =
  | "not_started"
  | "in_progress"
  | "failed_retry" // failed, attempts left
  | "pending_review" // essay/coding awaiting an instructor
  | "passed"
  | "failed_final"; // failed, no attempts left

export interface AttemptFact {
  assessmentId: string;
  attemptNumber: number;
  status: "in_progress" | "submitted" | "graded";
  passed: boolean | null;
  percent: number | null;
  submittedAt: string | null;
}

export interface AssessmentListItem {
  id: string;
  title: string;
  courseSlug: string;
  courseTitle: string;
  passMark: number;
  maxAttempts: number | null;
  timeLimitMinutes: number | null;
  attemptsUsed: number;
  status: AssessmentStatus;
  bestPercent: number | null;
  lastPercent: number | null;
  lastSubmittedAt: string | null;
}

/** Upcoming = something the learner can still do; completed = passed, in review, or out of attempts. */
export const UPCOMING_STATUSES: readonly AssessmentStatus[] = ["in_progress", "not_started", "failed_retry"];
export const isUpcoming = (s: AssessmentStatus) => UPCOMING_STATUSES.includes(s);

/** Pure: derives the learner-facing status of one assessment from their attempts. */
export function classifyAssessment(
  maxAttempts: number | null,
  attempts: Pick<AttemptFact, "status" | "passed">[],
): AssessmentStatus {
  if (attempts.some((a) => a.status === "in_progress")) return "in_progress";
  if (attempts.some((a) => a.passed === true)) return "passed";
  if (attempts.some((a) => a.status === "submitted")) return "pending_review";
  if (attempts.length === 0) return "not_started";
  const exhausted = maxAttempts !== null && attempts.length >= maxAttempts;
  return exhausted ? "failed_final" : "failed_retry";
}

interface EnrollmentRow {
  version_id: string;
  courses: { slug: string };
  course_versions: { title: string };
}

/** Every assessment in the learner courses with their attempt history (request-scoped client). */
export async function listMyAssessments(
  supabase: SupabaseClient,
  userId: string,
): Promise<AssessmentListItem[]> {
  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("version_id, courses!inner(slug), course_versions!inner(title)")
    .eq("user_id", userId)
    .neq("status", "cancelled");
  if (!enrollments?.length) return [];

  const rows = enrollments as unknown as EnrollmentRow[];
  const meta = new Map(rows.map((e) => [e.version_id, { slug: e.courses.slug, title: e.course_versions.title }]));

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id, title, version_id, pass_mark, max_attempts, time_limit_minutes, position")
    .in("version_id", [...meta.keys()])
    .order("position");
  if (!assessments?.length) return [];

  const { data: attempts } = await supabase
    .from("assessment_attempts")
    .select("assessment_id, attempt_number, status, passed, percent, submitted_at")
    .eq("user_id", userId)
    .in(
      "assessment_id",
      assessments.map((a) => a.id as string),
    );
  const facts: AttemptFact[] = (attempts ?? []).map((a) => ({
    assessmentId: a.assessment_id as string,
    attemptNumber: a.attempt_number as number,
    status: a.status as AttemptFact["status"],
    passed: (a.passed as boolean | null) ?? null,
    percent: a.percent === null ? null : Number(a.percent),
    submittedAt: (a.submitted_at as string | null) ?? null,
  }));

  return assessments.map((a) => {
    const mine = facts.filter((f) => f.assessmentId === a.id).sort((x, y) => x.attemptNumber - y.attemptNumber);
    const finished = mine.filter((f) => f.status !== "in_progress" && f.percent !== null);
    const m = meta.get(a.version_id as string)!;
    return {
      id: a.id as string,
      title: a.title as string,
      courseSlug: m.slug,
      courseTitle: m.title,
      passMark: a.pass_mark as number,
      maxAttempts: (a.max_attempts as number | null) ?? null,
      timeLimitMinutes: (a.time_limit_minutes as number | null) ?? null,
      attemptsUsed: mine.length,
      status: classifyAssessment((a.max_attempts as number | null) ?? null, mine),
      bestPercent: finished.length ? Math.max(...finished.map((f) => f.percent as number)) : null,
      lastPercent: finished.length ? (finished[finished.length - 1].percent as number) : null,
      lastSubmittedAt: finished.length ? finished[finished.length - 1].submittedAt : null,
    };
  });
}
