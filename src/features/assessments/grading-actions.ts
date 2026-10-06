"use server";

import { revalidatePath } from "next/cache";
import { tryEvaluateCompletion } from "@/features/completion/evaluate";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { notify } from "@/services/notifications";
import { createAdminClient } from "@/services/supabase/admin";
import { gradeWithManualScores, regradeBlockedReason, validateManualGrade } from "./grading";
import { getAttemptForGrading } from "./manual-grading";

export type GradeAttemptResult =
  | { ok: true; passed: boolean; percent: number; courseCompleted: boolean }
  | { ok: false; error: string };

const NOT_AVAILABLE = "This attempt is not available.";

/**
 * Grades (or re-grades) the essay/coding questions of a submitted attempt (T-252). Only the course
 * owner gets past getAttemptForGrading. The final score covers every question; a pass can complete
 * the course and issue the certificate. The learner is notified and the change is audited.
 */
export async function gradeAssessmentAttempt(
  attemptId: string,
  input: { points: Record<string, number>; feedback: Record<string, string>; overall: string },
): Promise<GradeAttemptResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const ctx = await getAttemptForGrading(supabase, user.id, attemptId);
  if (!ctx) return { ok: false, error: NOT_AVAILABLE };

  const check = validateManualGrade(ctx.keyed, {
    points: input?.points,
    feedback: input?.feedback,
    overall: input?.overall,
  });
  if (!check.ok) return check;

  const grade = gradeWithManualScores(ctx.keyed, ctx.attempt.answers, ctx.passMark, check.scores);
  const passed = grade.passed === true;
  const admin = createAdminClient();

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("status")
    .eq("id", ctx.attempt.enrollment_id)
    .maybeSingle();
  const blocked = regradeBlockedReason(
    ctx.attempt.passed,
    passed,
    enrollment?.status === "completed",
  );
  if (blocked) return { ok: false, error: blocked };

  // Guarded on the state we read, so two people grading at once can't silently overwrite each other.
  let update = admin
    .from("assessment_attempts")
    .update({
      status: "graded",
      manual_scores: check.scores,
      feedback: check.feedback,
      score: grade.score,
      max_score: grade.maxScore,
      percent: grade.percent,
      passed,
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    })
    .eq("id", ctx.attempt.id)
    .eq("status", ctx.attempt.status);
  update =
    ctx.attempt.graded_at === null
      ? update.is("graded_at", null)
      : update.eq("graded_at", ctx.attempt.graded_at);
  const { data: saved, error } = await update.select("id").maybeSingle();
  if (error) return { ok: false, error: "We could not save the grade. Please try again." };
  if (!saved)
    return {
      ok: false,
      error: "This attempt changed while you were grading it. Reload the page and try again.",
    };

  const completion = passed ? await tryEvaluateCompletion(admin, ctx.attempt.enrollment_id) : null;

  await notify({
    userId: ctx.attempt.user_id,
    category: "assignment",
    title: `Your answers on ${ctx.assessmentTitle} were graded`,
    body: `${grade.percent}% · ${passed ? "Passed" : "Not passed"}`,
    href: `/learner/courses/${ctx.courseSlug}/assessments/${ctx.assessmentId}`,
  });
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "assessment.attempt_graded",
    resourceType: "assessment_attempt",
    resourceId: ctx.attempt.id,
    metadata: {
      assessmentId: ctx.assessmentId,
      regrade: ctx.attempt.status === "graded",
      previousPassed: ctx.attempt.passed,
      passed,
      percent: grade.percent,
    },
  });

  revalidatePath("/instructor/grading");
  revalidatePath(`/instructor/grading/attempts/${ctx.attempt.id}`);
  revalidatePath(`/learner/courses/${ctx.courseSlug}`, "layout");
  revalidatePath("/learner/assessments");
  return {
    ok: true,
    passed,
    percent: grade.percent,
    courseCompleted: completion?.complete ?? false,
  };
}
