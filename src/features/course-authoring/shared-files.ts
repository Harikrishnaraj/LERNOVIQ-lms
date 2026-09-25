import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_VIDEO_PREFIX } from "./uploads";

// A new draft version (ADR-011) reuses the storage objects of the version it was copied from, so
// deleting or replacing a file in one version must not delete the object while another version
// still points at it. These run AFTER the database row was changed, under the instructor RLS
// (all versions of a course belong to the same owner, so every referencing row is visible).

/** Is the attachment object still referenced by some lesson_assets row? */
export async function assetStillReferenced(supabase: SupabaseClient, storagePath: string): Promise<boolean> {
  const { count } = await supabase.from("lesson_assets").select("id", { count: "exact", head: true }).eq("storage_path", storagePath);
  return (count ?? 0) > 0;
}

/** Is the uploaded video still referenced by some lesson? */
export async function videoStillReferenced(supabase: SupabaseClient, storagePath: string): Promise<boolean> {
  const { count } = await supabase
    .from("lessons")
    .select("id", { count: "exact", head: true })
    .eq("video_url", `${STORAGE_VIDEO_PREFIX}${storagePath}`);
  return (count ?? 0) > 0;
}

/** Is the thumbnail URL still used by some version? */
export async function thumbnailStillReferenced(supabase: SupabaseClient, url: string): Promise<boolean> {
  const { count } = await supabase.from("course_versions").select("id", { count: "exact", head: true }).eq("thumbnail_url", url);
  return (count ?? 0) > 0;
}
