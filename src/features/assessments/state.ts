import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/services/supabase/admin";
import {
  decideStart,
  gradeAttempt,
  isExpired,
  isManualType,
  shouldRevealKey,
  type Answers,
  type StartDecision,
} from "./grading";
import { getLearnerAssessment, type LearnerAssessment, type QuestionType } from "./learner";
import {
  ATTEMPT_COLUMNS,
  finalizeAttempt,
  loadKeyedQuestions,
  type AttemptRow,
} from "./server";

export interface AttemptView {
  id: string;
  number: number;
  status: AttemptRow["status"];
  percent: number | null;
  passed: boolean | null;
  submittedAt: string | null;
  expiresAt: string | null;
  answers: Answers;
}

export interface ResultQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  earned: number;
  /** null = awaiting manual review */
  correct: boolean | null;
  yourAnswer: string | string[] | null;
  options: { id: string; label: string }[];
  /** Present only when the key may be revealed. */
  correctOptionIds?: string[];
  acceptedAnswers?: string[];
  explanation?: string;
}

export interface AssessmentPageState {
  assessment: LearnerAssessment;
  courseSlug: string;
  attempts: AttemptView[];
  inProgress: AttemptView | null;
  latest: AttemptView | null;
  result: { questions: ResultQuestion[]; revealed: boolean; score: number; maxScore: number } | null;
  start: StartDecision;
}

const toView = (a: AttemptRow): AttemptView => ({
  id: a.id,
  number: a.attempt_number,
  status: a.status,
  percent: a.percent === null ? null : Number(a.percent),
  passed: a.passed,
  submittedAt: a.submitted_at,
  expiresAt: a.expires_at,
  answers: a.answers,
});

/**
 * Everything the assessment page renders for an enrolled learner, or null when the assessment
 * is not accessible. Expired in-progress attempts are graded here so nobody keeps working past
 * the deadline. Answer keys are read with the service role and only returned when revealable.
 */
export async function getAssessmentPageState(
  supabase: SupabaseClient,
  userId: string,
  courseSlug: string,
  assessmentId: string,
): Promise<AssessmentPageState | null> {
  const assessment = await getLearnerAssessment(supabase, assessmentId);
  if (!assessment) return null;

  const { data: row } = await supabase
    .from("assessments")
    .select("version_id")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!row) return null;
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("id, courses!inner(slug)")
    .eq("user_id", userId)
    .eq("version_id", row.version_id)
    .neq("status", "cancelled")
    .maybeSingle();
  if (!enrollment) return null;
  // The URL slug must be the course of this assessment (no cross-course confusion).
  const enrolledSlug = (enrollment.courses as unknown as { slug: string }).slug;
  if (enrolledSlug !== courseSlug) return null;

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("assessment_attempts")
    .select(ATTEMPT_COLUMNS)
    .eq("assessment_id", assessmentId)
    .eq("enrollment_id", enrollment.id)
    .order("attempt_number");
  let attempts = (rows ?? []) as AttemptRow[];

  for (const [i, a] of attempts.entries()) {
    if (a.status === "in_progress" && isExpired(a.expires_at, new Date())) {
      const done = await finalizeAttempt(admin, a, assessment.passMark, a.answers);
      attempts = attempts.map((x, j) => (j === i ? done.attempt : x));
    }
  }

  const views = attempts.map(toView);
  const inProgress = views.find((a) => a.status === "in_progress") ?? null;
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const latestRow = finished[finished.length - 1] ?? null;

  let result: AssessmentPageState["result"] = null;
  if (latestRow) {
    const keyed = await loadKeyedQuestions(admin, assessmentId);
    const grade = gradeAttempt(keyed, latestRow.answers, assessment.passMark);
    const revealed = shouldRevealKey(
      finished.map((a) => ({ status: a.status, passed: a.passed })),
      assessment.maxAttempts,
    );
    result = {
      revealed,
      score: grade.score,
      maxScore: grade.maxScore,
      questions: keyed.map((q) => {
        const r = grade.results.find((x) => x.questionId === q.id)!;
        const learnerQ = assessment.questions.find((x) => x.id === q.id)!;
        const answer = latestRow.answers[q.id];
        return {
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          earned: r.earned,
          correct: r.correct,
          yourAnswer: answer ?? null,
          options: learnerQ.options,
          ...(revealed && !isManualType(q.type)
            ? {
                correctOptionIds: q.correctOptionIds,
                acceptedAnswers: q.acceptedAnswers,
                explanation: q.explanation,
              }
            : {}),
        };
      }),
    };
  }

  return {
    assessment,
    courseSlug,
    attempts: views,
    inProgress,
    latest: latestRow ? toView(latestRow) : null,
    result,
    start: decideStart(
      attempts.map((a) => ({ status: a.status, passed: a.passed })),
      assessment.maxAttempts,
    ),
  };
}
