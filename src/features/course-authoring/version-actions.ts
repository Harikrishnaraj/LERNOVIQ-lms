"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { getCourseForEditing } from "./queries";

export type NewVersionResult = { ok: true; versionNumber: number } | { ok: false; error: string };

/**
 * Starts a new draft version of a live (or archived) course by copying its newest version (ADR-011).
 * Only the owner may do it, and only while nothing is being edited: create_draft_version enforces
 * both inside the database.
 */
export async function startNewVersion(courseId: string): Promise<NewVersionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, error: "This course is not available." };
  if (course.version.status !== "published" && course.version.status !== "archived") {
    return { ok: false, error: "This course is already being edited." };
  }

  const { data, error } = await supabase.rpc("create_draft_version", { p_course_id: courseId });
  if (error || !data) {
    return { ok: false, error: error?.code === "22023" ? "This course is already being edited." : "We could not start a new version. Please try again." };
  }
  const versionNumber = course.version.versionNumber + 1;
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "course.version_created",
    resourceType: "course",
    resourceId: courseId,
    metadata: { versionId: data as string, versionNumber, copiedFrom: course.version.versionNumber },
  });
  revalidatePath(`/instructor/courses/${courseId}`, "layout");
  revalidatePath("/instructor/courses");
  return { ok: true, versionNumber };
}
