"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateAssignment, type AssignmentInput } from "./assignment-rules";
import { getCourseForEditing } from "./queries";

export type AssignmentResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = { ok: false, error: "This assignment is not available." } as const;
const LOCKED = { ok: false, error: "This course is locked while it is in review or published." } as const;
const FAILED = { ok: false, error: "We could not save that change. Please try again." } as const;

type Db = Awaited<ReturnType<typeof createClient>>;
type Ctx = { ok: true; supabase: Db; courseId: string; versionId: string } | { ok: false; result: { ok: false; error: string } };

// authenticate -> own course -> newest version editable. RLS (can_edit_version) backs it up.
async function authorize(courseId: string): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, result: { ok: false, error: "Please log in again." } };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, result: DENIED };
  if (!course.editable) return { ok: false, result: LOCKED };
  return { ok: true, supabase, courseId: course.courseId, versionId: course.version.id };
}

async function ownAssignment(db: Db, versionId: string, id: string) {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await db.from("assignments").select("id, assignment_submissions(id)").eq("id", id).eq("version_id", versionId).maybeSingle();
  return data ? { id: data.id as string, submissions: ((data.assignment_submissions as unknown as unknown[]) ?? []).length } : null;
}

function refresh(courseId: string) {
  revalidatePath(`/instructor/courses/${courseId}/assignments`, "layout");
  revalidatePath("/instructor/grading");
}

/** Creates an assignment with sensible defaults; details are edited on its own page. */
export async function createAssignment(courseId: string, input: { title: string }): Promise<AssignmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const title = typeof input?.title === "string" ? input.title.trim().replace(/\s+/g, " ") : "";
  if (title === "" || title.length > 200) {
    return { ok: false, error: "Enter a title up to 200 characters.", fieldErrors: { title: "Enter a title up to 200 characters." } };
  }
  const { data: existing } = await ctx.supabase.from("assignments").select("position").eq("version_id", ctx.versionId);
  const position = (existing ?? []).reduce((m, a) => Math.max(m, (a.position as number) + 1), 0);
  const { data, error } = await ctx.supabase.from("assignments").insert({ version_id: ctx.versionId, title, position }).select("id").single();
  if (error || !data) return FAILED;
  refresh(ctx.courseId);
  return { ok: true, id: data.id as string };
}

/** Saves the settings and the rubric (replaced atomically by set_assignment_rubric). */
export async function saveAssignment(courseId: string, id: string, input: AssignmentInput): Promise<AssignmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const own = await ownAssignment(ctx.supabase, ctx.versionId, id);
  if (!own) return DENIED;
  const parsed = validateAssignment(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  const v = parsed.value;

  const { data, error } = await ctx.supabase
    .from("assignments")
    .update({
      title: v.title,
      instructions: v.instructions,
      due_at: v.dueAt,
      max_points: v.maxPoints,
      allow_late: v.allowLate,
      allow_text: v.allowText,
      allow_file: v.allowFile,
      max_file_mb: v.maxFileMb,
    })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return FAILED;

  const rubric = await ctx.supabase.rpc("set_assignment_rubric", {
    p_assignment_id: id,
    p_criteria: v.criteria.map((c) => ({ title: c.title, description: c.description, max_points: c.maxPoints })),
  });
  if (rubric.error) return FAILED;
  refresh(ctx.courseId);
  return { ok: true, id };
}

/** Deletes an assignment that nobody has submitted to. */
export async function deleteAssignment(courseId: string, id: string): Promise<AssignmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const own = await ownAssignment(ctx.supabase, ctx.versionId, id);
  if (!own) return DENIED;
  if (own.submissions > 0) return { ok: false, error: "Learners have already submitted work, so this assignment cannot be deleted." };
  const { error } = await ctx.supabase.from("assignments").delete().eq("id", id);
  if (error) return FAILED;
  refresh(ctx.courseId);
  return { ok: true };
}
