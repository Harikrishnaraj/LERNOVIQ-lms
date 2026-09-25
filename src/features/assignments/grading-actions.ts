"use server";

import { revalidatePath } from "next/cache";
import { validateGrade } from "@/features/course-authoring/assignment-rules";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/services/notifications";
import { getSubmissionForGrading } from "./grading";

export type GradeResult = { ok: true } | { ok: false; error: string };

/**
 * Grades or re-grades one submission. The submission is read under the caller own RLS (so only the
 * course owner gets this far), the grade is validated against the rubric or the assignment points,
 * and grade_assignment_submission re-checks ownership and the bounds in the database. The learner
 * is notified.
 */
export async function gradeSubmission(
  submissionId: string,
  input: { scores: Record<string, number>; grade: number | null; feedback: string },
): Promise<GradeResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const sub = await getSubmissionForGrading(supabase, user.id, submissionId);
  if (!sub) return { ok: false, error: "This submission is not available." };

  const check = validateGrade({
    maxPoints: sub.maxPoints,
    criteria: sub.criteria,
    scores: input.scores ?? {},
    grade: typeof input.grade === "number" ? input.grade : null,
    feedback: typeof input.feedback === "string" ? input.feedback : "",
  });
  if (!check.ok) return check;

  const { data, error } = await supabase.rpc("grade_assignment_submission", {
    p_submission_id: submissionId,
    p_grade: check.grade,
    p_feedback: check.feedback,
    p_scores: check.scores,
  });
  if (error) return { ok: false, error: "We could not save the grade. Please try again." };
  const r = data as { result: string; user_id?: string; assignment_id?: string; title?: string };
  if (r.result !== "ok") {
    return { ok: false, error: r.result === "bad_grade" ? "That grade is outside the assignment points." : "This submission is not available." };
  }

  if (r.user_id) {
    await notify({
      userId: r.user_id,
      category: "assignment",
      title: `Your work on ${r.title} was graded`,
      body: `${check.grade} / ${sub.maxPoints}`,
      href: `/learner/assignments/${r.assignment_id}`,
    });
  }
  revalidatePath("/instructor/grading");
  revalidatePath(`/instructor/grading/${submissionId}`);
  revalidatePath("/learner/assignments");
  return { ok: true };
}
