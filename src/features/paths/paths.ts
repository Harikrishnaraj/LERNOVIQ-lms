import type { SupabaseClient } from "@supabase/supabase-js";

export interface PathSummary {
  pathId: string;
  slug: string;
  title: string;
  description: string;
  courseCount: number;
  completedCount: number;
  enrolled: boolean;
}

export type PathCourseStatus = "not_started" | "active" | "completed";

export interface PathCourse {
  courseId: string;
  slug: string;
  title: string;
  level: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  position: number;
  status: PathCourseStatus;
}

export interface PathDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  enrolled: boolean;
  courses: PathCourse[];
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Published paths with counts and the caller's progress (signed-in learners). */
export async function listPaths(supabase: SupabaseClient): Promise<PathSummary[]> {
  const { data, error } = await supabase.rpc("list_learning_paths");
  if (error) throw new Error(`list_learning_paths failed: ${error.message}`);
  return ((data ?? []) as {
    path_id: string;
    slug: string;
    title: string;
    description: string;
    course_count: number;
    completed_count: number;
    enrolled: boolean;
  }[]).map((r) => ({
    pathId: r.path_id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    courseCount: r.course_count,
    completedCount: r.completed_count,
    enrolled: r.enrolled,
  }));
}

/** One published path with its courses in order; null when unknown, malformed or not published. */
export async function getPath(supabase: SupabaseClient, slug: string): Promise<PathDetail | null> {
  if (!SLUG.test(slug)) return null;
  const { data, error } = await supabase.rpc("get_learning_path", { p_slug: slug });
  if (error) throw new Error(`get_learning_path failed: ${error.message}`);
  if (!data) return null;
  const d = data as {
    id: string;
    slug: string;
    title: string;
    description: string;
    enrolled: boolean;
    courses: {
      course_id: string;
      slug: string;
      title: string;
      level: string;
      duration_minutes: number;
      price_cents: number;
      currency: string;
      position: number;
      status: string;
    }[];
  };
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    enrolled: d.enrolled,
    courses: d.courses.map((c) => ({
      courseId: c.course_id,
      slug: c.slug,
      title: c.title,
      level: c.level,
      durationMinutes: c.duration_minutes,
      priceCents: c.price_cents,
      currency: c.currency,
      position: c.position,
      status: c.status === "completed" ? "completed" : c.status === "active" ? "active" : "not_started",
    })),
  };
}

export interface PathProgress {
  completed: number;
  total: number;
  percent: number;
  /** The first course, in path order, that is not completed yet. */
  next: PathCourse | null;
}

export function pathProgress(courses: PathCourse[]): PathProgress {
  const ordered = [...courses].sort((a, b) => a.position - b.position);
  const completed = ordered.filter((c) => c.status === "completed").length;
  return {
    completed,
    total: ordered.length,
    percent: ordered.length === 0 ? 0 : Math.round((completed / ordered.length) * 100),
    next: ordered.find((c) => c.status !== "completed") ?? null,
  };
}
