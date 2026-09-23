import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlayerSection } from "./navigation";

export interface PlayerCourse {
  courseId: string;
  slug: string;
  title: string;
  versionId: string;
  enrollmentId: string | null;
  sections: PlayerSection[];
  completedLessonIds: Set<string>;
  enrolled: boolean;
}

export interface PlayerLessonContent {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "assignment";
  /** Raw stored HTML: sanitize before rendering. */
  content: string;
  videoUrl: string | null;
  durationMinutes: number;
  isPreview: boolean;
}

interface OutlineRow {
  id: string;
  section_id: string;
  title: string;
  type: PlayerSection["lessons"][number]["type"];
  position: number;
  duration_minutes: number;
  is_preview: boolean;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Everything the player sidebar needs for the version the viewer is entitled to: their enrolled
 * version, or the live published version for a non-enrolled viewer (who only sees locks and
 * free previews). Returns null when the course is unknown or not visible to the viewer.
 */
export async function getPlayerCourse(
  supabase: SupabaseClient,
  userId: string | null,
  slug: string,
): Promise<PlayerCourse | null> {
  if (!SLUG.test(slug)) return null;

  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, published_version_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!course) return null;

  let enrollment: { id: string; version_id: string } | null = null;
  if (userId) {
    const { data } = await supabase
      .from("enrollments")
      .select("id, version_id")
      .eq("user_id", userId)
      .eq("course_id", course.id)
      .neq("status", "cancelled")
      .maybeSingle();
    enrollment = data;
  }

  const versionId = enrollment?.version_id ?? course.published_version_id;
  if (!versionId) return null;

  const [versionRes, sectionsRes, outlineRes, progressRes] = await Promise.all([
    supabase.from("course_versions").select("title").eq("id", versionId).maybeSingle(),
    supabase
      .from("course_sections")
      .select("id, title, position")
      .eq("version_id", versionId)
      .order("position"),
    supabase.rpc("get_lesson_outline", { p_version_id: versionId }),
    enrollment
      ? supabase
          .from("lesson_progress")
          .select("lesson_id")
          .eq("enrollment_id", enrollment.id)
          .not("completed_at", "is", null)
      : Promise.resolve({ data: [] as { lesson_id: string }[], error: null }),
  ]);
  if (!versionRes.data) return null;
  if (sectionsRes.error || outlineRes.error) throw new Error("player outline failed");

  const lessonsBySection = new Map<string, PlayerSection["lessons"]>();
  for (const l of ((outlineRes.data ?? []) as OutlineRow[]).sort((a, b) => a.position - b.position)) {
    const list = lessonsBySection.get(l.section_id) ?? [];
    list.push({
      id: l.id,
      title: l.title,
      type: l.type,
      durationMinutes: l.duration_minutes,
      isPreview: l.is_preview,
    });
    lessonsBySection.set(l.section_id, list);
  }

  return {
    courseId: course.id,
    slug: course.slug,
    title: versionRes.data.title as string,
    versionId,
    enrollmentId: enrollment?.id ?? null,
    enrolled: enrollment !== null,
    sections: (sectionsRes.data ?? []).map((s) => ({
      id: s.id as string,
      title: s.title as string,
      lessons: lessonsBySection.get(s.id as string) ?? [],
    })),
    completedLessonIds: new Set((progressRes.data ?? []).map((r) => r.lesson_id as string)),
  };
}

/** The lesson body. RLS decides access: null means locked / not found for this viewer. */
export async function getLessonContent(
  supabase: SupabaseClient,
  lessonId: string,
): Promise<PlayerLessonContent | null> {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, type, content, video_url, duration_minutes, is_preview")
    .eq("id", lessonId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    title: data.title,
    type: data.type,
    content: data.content,
    videoUrl: data.video_url,
    durationMinutes: data.duration_minutes,
    isPreview: data.is_preview,
  };
}
