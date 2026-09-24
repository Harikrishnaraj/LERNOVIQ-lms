import type { SupabaseClient } from "@supabase/supabase-js";
import { flattenLessons, type PlayerSection } from "@/features/player/navigation";
import { loadOutline } from "@/features/player/data";
import { getCourseForEditing } from "./queries";

export interface CoursePreview {
  courseId: string;
  title: string;
  versionId: string;
  sections: PlayerSection[];
}

/**
 * The instructor own newest version as the learner player sees it (F-208). Null when the course
 * is not the caller own (getCourseForEditing checks) or the outline cannot be read.
 */
export async function getCoursePreview(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<CoursePreview | null> {
  const course = await getCourseForEditing(supabase, userId, courseId);
  if (!course) return null;
  const outline = await loadOutline(supabase, course.version.id);
  if (!outline) return null;
  return { courseId: course.courseId, title: outline.title, versionId: course.version.id, sections: outline.sections };
}

export function firstPreviewLessonId(sections: PlayerSection[]): string | null {
  return flattenLessons(sections)[0]?.id ?? null;
}
