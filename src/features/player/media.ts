import type { SupabaseClient } from "@supabase/supabase-js";
import { isStorageVideo, storageVideoPath } from "@/features/course-authoring/uploads";
import { ASSET_BUCKET, VIDEO_BUCKET, supabaseStorage } from "@/services/storage";

const VIDEO_URL_TTL = 60 * 60; // 1 hour: long enough for a lesson, short enough not to be shared around
const ASSET_URL_TTL = 10 * 60;

/**
 * The playable source for a lesson video. Uploaded files get a short-lived signed URL; external
 * links must be https. Call only AFTER the lesson row was read under the learner own RLS, which is
 * what proves entitlement (enrolled, owner, staff, or a free preview).
 */
export async function resolveVideoSrc(videoRef: string | null): Promise<string | null> {
  if (!videoRef) return null;
  if (isStorageVideo(videoRef)) {
    const path = storageVideoPath(videoRef)!;
    try {
      return await supabaseStorage.createSignedUrl(VIDEO_BUCKET, path, VIDEO_URL_TTL);
    } catch {
      return null;
    }
  }
  return videoRef.startsWith("https://") ? videoRef : null;
}

export interface AssetLink {
  id: string;
  name: string;
  sizeBytes: number | null;
  url: string;
}

/** Attachments of a lesson the viewer may read (RLS on lesson_assets), each with a signed download link. */
export async function getAssetLinks(supabase: SupabaseClient, lessonId: string): Promise<AssetLink[]> {
  const { data } = await supabase
    .from("lesson_assets")
    .select("id, name, storage_path, size_bytes")
    .eq("lesson_id", lessonId)
    .order("created_at");
  const links: AssetLink[] = [];
  for (const a of data ?? []) {
    try {
      links.push({
        id: a.id as string,
        name: a.name as string,
        sizeBytes: (a.size_bytes as number | null) ?? null,
        url: await supabaseStorage.createSignedUrl(ASSET_BUCKET, a.storage_path as string, ASSET_URL_TTL),
      });
    } catch {
      /* a missing object must not break the lesson page */
    }
  }
  return links;
}
