import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonType } from "./curriculum";

export interface LessonAsset {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface LessonForEditing {
  id: string;
  sectionId: string;
  sectionTitle: string;
  title: string;
  type: LessonType;
  /** Stored (already sanitized) HTML. */
  content: string;
  videoRef: string | null;
  durationMinutes: number;
  isPreview: boolean;
  assets: LessonAsset[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A lesson of the version being authored, with its attachments. Null when the id is malformed or
 * the lesson is not part of `versionId` (so an instructor cannot open a lesson of another course
 * or of an older version through a mismatched URL).
 */
export async function getLessonForEditing(
  supabase: SupabaseClient,
  versionId: string,
  lessonId: string,
): Promise<LessonForEditing | null> {
  if (!UUID.test(lessonId)) return null;
  const { data } = await supabase
    .from("lessons")
    .select(
      "id, section_id, title, type, content, video_url, duration_minutes, is_preview, course_sections!inner(version_id, title)",
    )
    .eq("id", lessonId)
    .eq("course_sections.version_id", versionId)
    .maybeSingle();
  if (!data) return null;

  const { data: assets } = await supabase
    .from("lesson_assets")
    .select("id, name, storage_path, mime_type, size_bytes")
    .eq("lesson_id", lessonId)
    .order("created_at");

  return {
    id: data.id as string,
    sectionId: data.section_id as string,
    sectionTitle: (data.course_sections as unknown as { title: string }).title,
    title: data.title as string,
    type: data.type as LessonType,
    content: data.content as string,
    videoRef: (data.video_url as string | null) ?? null,
    durationMinutes: data.duration_minutes as number,
    isPreview: data.is_preview as boolean,
    assets: (assets ?? []).map((a) => ({
      id: a.id as string,
      name: a.name as string,
      storagePath: a.storage_path as string,
      mimeType: (a.mime_type as string | null) ?? null,
      sizeBytes: (a.size_bytes as number | null) ?? null,
    })),
  };
}
