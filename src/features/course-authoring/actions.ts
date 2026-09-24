"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { MAX_THUMBNAIL_BYTES, sniffImage } from "@/lib/image";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { THUMBNAIL_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";
import { getCourseForEditing } from "./queries";
import { basicsSchema, slugCandidates } from "./schemas";

export type BasicsResult =
  | { ok: true; courseId: string; thumbnailError?: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

function fields(formData: FormData) {
  const text = (k: string) => (typeof formData.get(k) === "string" ? (formData.get(k) as string) : "");
  return {
    title: text("title"),
    subtitle: text("subtitle"),
    categorySlug: text("categorySlug"),
    description: text("description"),
    outcomes: text("outcomes"),
    requirements: text("requirements"),
    level: text("level"),
    language: text("language"),
  };
}

function parseBasics(formData: FormData) {
  const parsed = basicsSchema.safeParse(fields(formData));
  if (parsed.success) return { data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { fieldErrors };
}

type ThumbnailRead =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "ok"; file: { bytes: Uint8Array; kind: NonNullable<ReturnType<typeof sniffImage>> } };

/** Validates an optional thumbnail by content and size. */
async function readThumbnail(formData: FormData): Promise<ThumbnailRead> {
  const file = formData.get("thumbnail");
  if (!(file instanceof File) || file.size === 0) return { kind: "none" };
  if (file.size > MAX_THUMBNAIL_BYTES) return { kind: "error", message: "The thumbnail must be 2 MB or smaller." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return { kind: "error", message: "The thumbnail must be a PNG, JPEG or WebP image." };
  return { kind: "ok", file: { bytes, kind } };
}

/** Public URL -> object path inside our thumbnail bucket (best-effort cleanup of replaced files). */
function thumbnailPathFromUrl(url: string | null): string | null {
  const marker = `/object/public/${THUMBNAIL_BUCKET}/`;
  const i = url?.indexOf(marker) ?? -1;
  return url && i >= 0 ? decodeURIComponent(url.slice(i + marker.length)) : null;
}

type CategoryLookup = { ok: true; id: string | null } | { ok: false; error: string };

async function categoryId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  slug: string | null,
): Promise<CategoryLookup> {
  if (slug === null) return { ok: true, id: null };
  const { data } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  return data ? { ok: true, id: data.id as string } : { ok: false, error: "Pick a category from the list." };
}

/** Step 1: creates the course and its first draft version (F-202). */
export async function createCourseAction(formData: FormData): Promise<BasicsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "course.create"))) {
    return { ok: false, error: "Your account cannot create courses." };
  }

  const parsed = parseBasics(formData);
  if ("fieldErrors" in parsed) return { ok: false, fieldErrors: parsed.fieldErrors };
  const thumb = await readThumbnail(formData);
  if (thumb.kind === "error") return { ok: false, fieldErrors: { thumbnail: thumb.message } };
  const category = await categoryId(supabase, parsed.data.categorySlug);
  if (!category.ok) return { ok: false, fieldErrors: { categorySlug: category.error } };

  // Slug is unique: try the plain slug first, then numbered / random suffixes.
  let courseId: string | null = null;
  for (const slug of slugCandidates(parsed.data.title)) {
    const { data, error } = await supabase
      .from("courses")
      .insert({ slug, instructor_id: user.id, category_id: category.id })
      .select("id")
      .single();
    if (!error) {
      courseId = data.id as string;
      break;
    }
    if (error.code !== "23505") return { ok: false, error: "We could not create the course. Please try again." };
  }
  if (!courseId) return { ok: false, error: "We could not find a free URL for this course. Try a different title." };

  const { error: versionError } = await supabase.from("course_versions").insert({
    course_id: courseId,
    version_number: 1,
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    description: parsed.data.description,
    outcomes: parsed.data.outcomes,
    requirements: parsed.data.requirements,
    level: parsed.data.level,
    language: parsed.data.language,
  });
  if (versionError) {
    // Never leave a course without a version behind (instructors cannot delete courses: admin cleanup).
    await createAdminClient().from("courses").delete().eq("id", courseId);
    return { ok: false, error: "We could not create the course. Please try again." };
  }

  let thumbnailError: string | undefined;
  if (thumb.kind === "ok") {
    try {
      const url = await supabaseStorage.uploadPublic(
        THUMBNAIL_BUCKET,
        `${courseId}/${randomUUID()}.${thumb.file.kind.ext}`,
        thumb.file.bytes,
        thumb.file.kind.mime,
      );
      await supabase
        .from("course_versions")
        .update({ thumbnail_url: url })
        .eq("course_id", courseId)
        .eq("version_number", 1);
    } catch {
      thumbnailError = "The course was created, but the thumbnail could not be uploaded. Add it again below.";
    }
  }

  revalidatePath("/instructor/courses");
  revalidatePath("/instructor");
  return { ok: true, courseId, thumbnailError };
}

/** Saves the basics of the version currently being authored (draft or changes requested). */
export async function updateBasicsAction(courseId: string, formData: FormData): Promise<BasicsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, error: "This course is not available." };
  if (!course.editable) {
    return { ok: false, error: "This course is locked while it is in review or published." };
  }

  const parsed = parseBasics(formData);
  if ("fieldErrors" in parsed) return { ok: false, fieldErrors: parsed.fieldErrors };
  const thumb = await readThumbnail(formData);
  if (thumb.kind === "error") return { ok: false, fieldErrors: { thumbnail: thumb.message } };
  const category = await categoryId(supabase, parsed.data.categorySlug);
  if (!category.ok) return { ok: false, fieldErrors: { categorySlug: category.error } };

  const patch: Record<string, unknown> = {
    title: parsed.data.title,
    subtitle: parsed.data.subtitle,
    description: parsed.data.description,
    outcomes: parsed.data.outcomes,
    requirements: parsed.data.requirements,
    level: parsed.data.level,
    language: parsed.data.language,
  };

  const oldPath = thumbnailPathFromUrl(course.version.thumbnailUrl);
  let uploadedPath: string | null = null;
  if (thumb.kind === "ok") {
    uploadedPath = `${courseId}/${randomUUID()}.${thumb.file.kind.ext}`;
    try {
      patch.thumbnail_url = await supabaseStorage.uploadPublic(
        THUMBNAIL_BUCKET,
        uploadedPath,
        thumb.file.bytes,
        thumb.file.kind.mime,
      );
    } catch {
      return { ok: false, fieldErrors: { thumbnail: "The thumbnail could not be uploaded. Please try again." } };
    }
  } else if (formData.get("removeThumbnail") === "on") {
    patch.thumbnail_url = null;
  }

  const { data: updated, error } = await supabase
    .from("course_versions")
    .update(patch)
    .eq("id", course.version.id)
    .select("id");
  if (error || !updated?.length) {
    if (uploadedPath) await supabaseStorage.remove(THUMBNAIL_BUCKET, [uploadedPath]).catch(() => {});
    return { ok: false, error: "We could not save your changes. Please try again." };
  }
  const { error: categoryError } = await supabase
    .from("courses")
    .update({ category_id: category.id })
    .eq("id", courseId);
  if (categoryError) return { ok: false, error: "We could not save the category. Please try again." };

  // The replaced/removed file is no longer referenced.
  if (oldPath && "thumbnail_url" in patch) {
    await supabaseStorage.remove(THUMBNAIL_BUCKET, [oldPath]).catch(() => {});
  }

  revalidatePath("/instructor/courses");
  revalidatePath(`/instructor/courses/${courseId}/basics`);
  return { ok: true, courseId };
}
