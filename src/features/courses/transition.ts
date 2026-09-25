import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/services/notifications";
import { recordAudit } from "@/services/audit";
import { createAdminClient } from "@/services/supabase/admin";
import { can } from "@/lib/permissions/can";
import { nextCourseStatus, isCourseStatus, type CourseAction } from "./course-status";
import { AUDIT_FOR_ACTION, validateDecisionNote } from "./transition-rules";

export type TransitionResult = { ok: true; to: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applies one reviewer decision to a course newest version (F-406, F-310). Order of gates:
 * signed in -> course.review permission (checked server-side, not from the UI) -> the course
 * exists -> the state machine allows the action from the current status -> a note where one is
 * required. The write is atomic and compare-and-set on the status (apply_course_transition), so
 * two reviewers acting at once cannot both win; the decision is audited.
 */
export async function transitionCourse(
  supabase: SupabaseClient,
  courseId: string,
  action: CourseAction,
  note: string,
): Promise<TransitionResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "course.review"))) {
    return { ok: false, error: "You do not have permission to review courses." };
  }
  if (!UUID.test(courseId)) return { ok: false, error: "Course not found." };

  // Archiving takes the LIVE version off the catalog even when a newer draft exists on top of it
  // (ADR-011); every other decision concerns the newest version.
  type VersionRow = { id: string; status: string; version_number: number };
  let version = null as VersionRow | null;
  if (action === "archive") {
    const { data: course } = await supabase.from("courses").select("published_version_id").eq("id", courseId).maybeSingle();
    if (course?.published_version_id) {
      const { data } = await supabase
        .from("course_versions")
        .select("id, status, version_number")
        .eq("id", course.published_version_id)
        .maybeSingle();
      version = data as VersionRow | null;
    }
  }
  if (!version) {
    const { data } = await supabase
      .from("course_versions")
      .select("id, status, version_number")
      .eq("course_id", courseId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    version = data as VersionRow | null;
  }
  if (!version) return { ok: false, error: "Course not found." };
  const from = version.status as string;
  if (!isCourseStatus(from)) return { ok: false, error: "Course not found." };

  const to = nextCourseStatus(from, action);
  if (!to) return { ok: false, error: `This course is ${from.replace("_", " ")}, so that is not possible right now.` };
  const noteError = validateDecisionNote(action, note);
  if (noteError) return { ok: false, error: noteError };

  const { data: applied, error } = await createAdminClient().rpc("apply_course_transition", {
    p_version_id: version.id,
    p_from: from,
    p_to: to,
    p_actor: user.id,
    p_action: action,
    p_note: note.trim(),
  });
  if (error) return { ok: false, error: "We could not save that decision. Please try again." };
  if (applied !== true) return { ok: false, error: "Someone else just changed this course. Reload and try again." };

  const audit = AUDIT_FOR_ACTION[action];
  if (audit) {
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: audit,
      resourceType: "course",
      resourceId: courseId,
      metadata: { versionId: version.id as string, versionNumber: version.version_number as number, from, to, hasNote: note.trim() !== "" },
    });
  }

  // Tell the instructor about decisions that concern them (not the internal "start review").
  const headline: Partial<Record<CourseAction, string>> = {
    request_changes: "asked for changes on",
    approve: "approved",
    reject: "rejected",
    publish: "published",
    archive: "archived",
  };
  if (headline[action]) {
    const { data: owner } = await supabase.from("courses").select("instructor_id").eq("id", courseId).maybeSingle();
    if (owner?.instructor_id) {
      await notify({
        userId: owner.instructor_id as string,
        category: "review",
        title: `A reviewer ${headline[action]} your course`,
        body: note.trim() ? note.trim().slice(0, 300) : undefined,
        href: `/instructor/courses/${courseId}`,
      });
    }
  }
  return { ok: true, to };
}
