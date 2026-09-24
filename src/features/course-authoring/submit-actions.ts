"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/services/supabase/admin";
import { MAX_SUBMISSION_NOTES, evaluateReadiness, getReadinessSnapshot } from "./readiness";
import { getCourseForEditing } from "./queries";
import { assertCourseTransition, isCourseStatus } from "@/features/courses/course-status";

export type SubmitResult = { ok: true } | { ok: false; error: string; missing?: string[] };

/**
 * Submits the version being authored for review (F-210). Server-side gates, in order: signed in,
 * owns the course, version is editable (draft / changes requested), notes length, and the same
 * readiness rules the checklist shows. The status flip and the submission record are written by
 * `submit_course_version`, which only the service role can call, so RLS never has to let an
 * instructor write `status`.
 */
export async function submitCourseForReview(courseId: string, notes: string): Promise<SubmitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, error: "This course is not available." };
  if (!course.editable || !isCourseStatus(course.version.status)) {
    return { ok: false, error: "This course has already been submitted." };
  }
  assertCourseTransition(course.version.status, "submit");

  const cleanNotes = (notes ?? "").trim();
  if (cleanNotes.length > MAX_SUBMISSION_NOTES) {
    return { ok: false, error: `Keep your notes under ${MAX_SUBMISSION_NOTES} characters.` };
  }

  const snapshot = await getReadinessSnapshot(supabase, course.version.id, course.categorySlug);
  if (!snapshot) return { ok: false, error: "This course is not available." };
  const report = evaluateReadiness(snapshot);
  if (!report.ready) {
    return {
      ok: false,
      error: "Finish the readiness checklist before submitting.",
      missing: report.missing.map((m) => m.label),
    };
  }

  const { data, error } = await createAdminClient().rpc("submit_course_version", {
    p_version_id: course.version.id,
    p_user_id: user.id,
    p_notes: cleanNotes,
  });
  if (error) return { ok: false, error: "We could not submit your course. Please try again." };
  if (data !== true) return { ok: false, error: "This course has already been submitted." };

  revalidatePath(`/instructor/courses/${courseId}`, "layout");
  revalidatePath("/instructor/courses");
  return { ok: true };
}
