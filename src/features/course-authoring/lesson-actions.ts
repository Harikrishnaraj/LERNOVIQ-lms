"use server";

import { assetStillReferenced, videoStillReferenced } from "./shared-files";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { sanitizeLessonHtml } from "@/lib/sanitize";
import { createClient } from "@/lib/supabase/server";
import { ASSET_BUCKET, VIDEO_BUCKET, supabaseStorage } from "@/services/storage";
import { getCourseForEditing } from "./queries";
import { getLessonForEditing } from "./lessons";
import {
  normalizeVideoRef,
  storageVideoPath,
  validateUpload,
  type MediaKind,
} from "./uploads";

export type LessonResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };
export type UploadTicket =
  | { ok: true; bucket: string; path: string; token: string; ref: string }
  | { ok: false; error: string };

const DENIED = { ok: false, error: "This lesson is not available." } as const;
const LOCKED = { ok: false, error: "This course is locked while it is in review or published." } as const;
const FAILED = { ok: false, error: "We could not save that change. Please try again." } as const;
const MAX_ASSETS = 10;
const MAX_CONTENT_CHARS = 200_000;

const saveSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200, "Keep the title under 200 characters."),
  content: z.string().max(MAX_CONTENT_CHARS, "The lesson text is too long."),
  durationMinutes: z.number().int("Use whole minutes.").min(0, "Duration cannot be negative.").max(1440, "Duration is at most 1440 minutes."),
  isPreview: z.boolean(),
});

type Db = Awaited<ReturnType<typeof createClient>>;
type Ctx =
  | { ok: true; supabase: Db; courseId: string; versionId: string; lesson: NonNullable<Awaited<ReturnType<typeof getLessonForEditing>>> }
  | { ok: false; result: { ok: false; error: string } };

// authenticate -> own course -> newest version editable -> lesson belongs to that version.
async function authorize(courseId: string, lessonId: string): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, result: { ok: false, error: "Please log in again." } };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, result: DENIED };
  if (!course.editable) return { ok: false, result: LOCKED };
  const lesson = await getLessonForEditing(supabase, course.version.id, lessonId);
  if (!lesson) return { ok: false, result: DENIED };
  return { ok: true, supabase, courseId: course.courseId, versionId: course.version.id, lesson };
}

const editorPath = (courseId: string, lessonId: string) => `/instructor/courses/${courseId}/lessons/${lessonId}`;

/** Saves title, rich text (sanitized here, never trusting the browser), video reference, duration, preview flag. */
export async function saveLesson(
  courseId: string,
  lessonId: string,
  input: { title: string; content: string; videoRef: string | null; durationMinutes: number; isPreview: boolean },
): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const video = normalizeVideoRef(input.videoRef, ctx.courseId);
  if (!video.ok) return { ok: false, error: video.error, fieldErrors: { videoRef: video.error } };

  const patch = {
    title: parsed.data.title,
    content: sanitizeLessonHtml(parsed.data.content),
    video_url: ctx.lesson.type === "video" ? video.value : null,
    duration_minutes: parsed.data.durationMinutes,
    is_preview: parsed.data.isPreview,
  };
  const { data, error } = await ctx.supabase.from("lessons").update(patch).eq("id", lessonId).select("id");
  if (error || !data?.length) return FAILED;

  // The replaced/removed uploaded video is no longer referenced.
  const before = storageVideoPath(ctx.lesson.videoRef ?? "");
  const after = storageVideoPath(patch.video_url ?? "");
  if (before && before !== after && !(await videoStillReferenced(ctx.supabase, before))) {
    await supabaseStorage.remove(VIDEO_BUCKET, [before]).catch(() => {});
  }

  revalidatePath(editorPath(courseId, lessonId));
  revalidatePath(`/instructor/courses/${courseId}/curriculum`);
  return { ok: true };
}

/** Issues a one-time direct-to-storage upload ticket after validating the file description. */
export async function requestUpload(
  courseId: string,
  lessonId: string,
  kind: MediaKind,
  file: { name: string; size: number; type: string },
): Promise<UploadTicket> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return { ok: false, error: ctx.result.error };
  if (kind !== "video" && kind !== "asset") return { ok: false, error: "Unsupported upload." };
  if (kind === "video" && ctx.lesson.type !== "video") return { ok: false, error: "Only video lessons can have a video." };
  if (kind === "asset" && ctx.lesson.assets.length >= MAX_ASSETS) {
    return { ok: false, error: `A lesson can have at most ${MAX_ASSETS} attachments.` };
  }
  const check = validateUpload(kind, file);
  if (!check.ok) return check;

  const bucket = kind === "video" ? VIDEO_BUCKET : ASSET_BUCKET;
  const path = `${ctx.courseId}/${lessonId}/${randomUUID()}.${check.ext}`;
  try {
    const { token } = await supabaseStorage.createSignedUpload(bucket, path);
    return { ok: true, bucket, path, token, ref: kind === "video" ? `storage://${bucket}/${path}` : path };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/** After the browser finished uploading an attachment: verify the object exists and record it. */
export async function registerAsset(
  courseId: string,
  lessonId: string,
  file: { path: string; name: string; size: number; type: string },
): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;
  const check = validateUpload("asset", file);
  if (!check.ok) return check;
  // The path must be one this lesson was issued (prefix), never an arbitrary object.
  if (typeof file.path !== "string" || !file.path.startsWith(`${ctx.courseId}/${lessonId}/`) || file.path.includes("..")) {
    return { ok: false, error: "That upload does not belong to this lesson." };
  }
  if (ctx.lesson.assets.length >= MAX_ASSETS) return { ok: false, error: `A lesson can have at most ${MAX_ASSETS} attachments.` };
  if (!(await supabaseStorage.exists(ASSET_BUCKET, file.path).catch(() => false))) {
    return { ok: false, error: "The upload did not complete. Please try again." };
  }

  const { error } = await ctx.supabase.from("lesson_assets").insert({
    lesson_id: lessonId,
    name: check.safeName,
    storage_path: file.path,
    mime_type: check.type,
    size_bytes: file.size,
  });
  if (error) return FAILED;
  revalidatePath(editorPath(courseId, lessonId));
  return { ok: true };
}

export async function deleteAsset(courseId: string, lessonId: string, assetId: string): Promise<LessonResult> {
  const ctx = await authorize(courseId, lessonId);
  if (!ctx.ok) return ctx.result;
  const asset = ctx.lesson.assets.find((a) => a.id === assetId);
  if (!asset) return DENIED;

  const { error } = await ctx.supabase.from("lesson_assets").delete().eq("id", assetId);
  if (error) return FAILED;
  // A newer or older version of the course may still use the same file.
  if (!(await assetStillReferenced(ctx.supabase, asset.storagePath))) {
    await supabaseStorage.remove(ASSET_BUCKET, [asset.storagePath]).catch(() => {});
  }
  revalidatePath(editorPath(courseId, lessonId));
  return { ok: true };
}
