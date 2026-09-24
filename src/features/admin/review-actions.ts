"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { validateNoteBody } from "./review";

export type NoteResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Adds a reviewer note to the course, one of its sections, or one of its lessons. The target must
 * belong to the version under review, and notes can only be added while it is being reviewed.
 */
export async function addReviewNote(
  courseId: string,
  target: { type: "course" | "section" | "lesson"; id: string | null },
  body: string,
): Promise<NoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "course.review"))) {
    return { ok: false, error: "You do not have permission to review courses." };
  }
  const bodyError = validateNoteBody(body ?? "");
  if (bodyError) return { ok: false, error: bodyError };
  if (!UUID.test(courseId)) return { ok: false, error: "Course not found." };

  const { data: version } = await supabase
    .from("course_versions")
    .select("id, status, title")
    .eq("course_id", courseId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { ok: false, error: "Course not found." };
  if (version.status !== "submitted" && version.status !== "in_review") {
    return { ok: false, error: "Notes can only be added while the course is being reviewed." };
  }

  let title = version.title as string;
  if (target.type === "section") {
    if (!target.id || !UUID.test(target.id)) return { ok: false, error: "That section does not exist." };
    const { data } = await supabase.from("course_sections").select("title").eq("id", target.id).eq("version_id", version.id).maybeSingle();
    if (!data) return { ok: false, error: "That section does not exist." };
    title = data.title as string;
  } else if (target.type === "lesson") {
    if (!target.id || !UUID.test(target.id)) return { ok: false, error: "That lesson does not exist." };
    const { data } = await supabase
      .from("lessons")
      .select("title, course_sections!inner(version_id)")
      .eq("id", target.id)
      .eq("course_sections.version_id", version.id)
      .maybeSingle();
    if (!data) return { ok: false, error: "That lesson does not exist." };
    title = data.title as string;
  } else if (target.id !== null) {
    return { ok: false, error: "A course note has no target." };
  }

  const { error } = await supabase.from("course_review_notes").insert({
    version_id: version.id,
    target_type: target.type,
    target_id: target.type === "course" ? null : target.id,
    target_title: title,
    body: body.trim(),
    author_id: user.id,
  });
  if (error) return { ok: false, error: "We could not save that note. Please try again." };
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: true };
}

/** Removes one of the caller own notes (RLS also enforces authorship). */
export async function deleteReviewNote(courseId: string, noteId: string): Promise<NoteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(noteId)) return { ok: false, error: "Note not found." };
  const { data, error } = await supabase.from("course_review_notes").delete().eq("id", noteId).eq("author_id", user.id).select("id");
  if (error || !data?.length) return { ok: false, error: "Note not found." };
  revalidatePath(`/admin/courses/${courseId}`);
  return { ok: true };
}
