import type { SupabaseClient } from "@supabase/supabase-js";
import { pickEditableVersion, type VersionInfo } from "./versions";

export interface CourseForEditing {
  courseId: string;
  slug: string;
  categorySlug: string | null;
  /** The newest version: the one being authored (or a locked one when nothing is editable). */
  version: {
    id: string;
    versionNumber: number;
    status: string;
    title: string;
    subtitle: string | null;
    description: string;
    outcomes: string[];
    requirements: string[];
    level: string;
    language: string;
    thumbnailUrl: string | null;
  };
  editable: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The instructor own course with its newest version, or null when the id is malformed, the course
 * does not exist, or it belongs to someone else (RLS + an explicit owner check: staff can read
 * every course but must not open the authoring screens).
 */
export async function getCourseForEditing(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<CourseForEditing | null> {
  if (!UUID.test(courseId)) return null;
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, instructor_id, categories(slug)")
    .eq("id", courseId)
    .maybeSingle();
  if (!course || course.instructor_id !== userId) return null;

  const { data: versions } = await supabase
    .from("course_versions")
    .select("id, version_number, status, title, subtitle, description, outcomes, requirements, level, language, thumbnail_url")
    .eq("course_id", courseId)
    .order("version_number", { ascending: false });
  const latest = versions?.[0];
  if (!latest) return null;

  const infos: VersionInfo[] = (versions ?? []).map((v) => ({
    id: v.id as string,
    versionNumber: v.version_number as number,
    status: v.status as string,
  }));
  return {
    courseId: course.id as string,
    slug: course.slug as string,
    categorySlug: (course.categories as unknown as { slug: string } | null)?.slug ?? null,
    version: {
      id: latest.id as string,
      versionNumber: latest.version_number as number,
      status: latest.status as string,
      title: latest.title as string,
      subtitle: (latest.subtitle as string | null) ?? null,
      description: (latest.description as string) ?? "",
      outcomes: (latest.outcomes as string[]) ?? [],
      requirements: (latest.requirements as string[]) ?? [],
      level: latest.level as string,
      language: latest.language as string,
      thumbnailUrl: (latest.thumbnail_url as string | null) ?? null,
    },
    editable: pickEditableVersion(infos) !== null,
  };
}
