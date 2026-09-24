"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { createAdminClient } from "@/services/supabase/admin";
import { getCourseForEditing } from "./queries";

export type ReopenResult = { ok: true } | { ok: false; error: string };

/**
 * A rejected course goes back to the instructor as a draft (state machine: rejected -> reopen ->
 * draft). Only the owner may do it; the write goes through the same audited, compare-and-set RPC
 * as every other transition.
 */
export async function reopenRejectedCourse(courseId: string): Promise<ReopenResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, error: "This course is not available." };
  if (course.version.status !== "rejected") return { ok: false, error: "Only a rejected course can be reopened." };

  const { data, error } = await createAdminClient().rpc("apply_course_transition", {
    p_version_id: course.version.id,
    p_from: "rejected",
    p_to: "draft",
    p_actor: user.id,
    p_action: "reopen",
    p_note: "",
  });
  if (error) return { ok: false, error: "We could not reopen your course. Please try again." };
  if (data !== true) return { ok: false, error: "Only a rejected course can be reopened." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "course.reopened",
    resourceType: "course",
    resourceId: courseId,
    metadata: { versionId: course.version.id, from: "rejected", to: "draft" },
  });
  revalidatePath(`/instructor/courses/${courseId}`, "layout");
  revalidatePath("/instructor/courses");
  return { ok: true };
}
