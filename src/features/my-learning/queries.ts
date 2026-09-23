import type { SupabaseClient } from "@supabase/supabase-js";

export interface LearningItem {
  enrollmentId: string;
  courseId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  durationMinutes: number;
  status: "active" | "completed";
  enrolledAt: string;
  completedAt: string | null;
  totalLessons: number;
  completedLessons: number;
  /** 0-100 */
  percent: number;
}

export interface SavedItem {
  courseId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
}

interface LearningRow {
  enrollment_id: string;
  course_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  duration_minutes: number;
  status: "active" | "completed";
  enrolled_at: string;
  completed_at: string | null;
  total_lessons: number;
  completed_lessons: number;
}

export function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

export function splitLearning(items: LearningItem[]) {
  return {
    inProgress: items.filter((i) => i.status !== "completed"),
    completed: items.filter((i) => i.status === "completed"),
  };
}

export async function getMyLearning(supabase: SupabaseClient): Promise<LearningItem[]> {
  const { data, error } = await supabase.rpc("my_learning");
  if (error) throw new Error(`my_learning failed: ${error.message}`);
  return ((data ?? []) as LearningRow[]).map((r) => ({
    enrollmentId: r.enrollment_id,
    courseId: r.course_id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    level: r.level,
    durationMinutes: r.duration_minutes,
    status: r.status,
    enrolledAt: r.enrolled_at,
    completedAt: r.completed_at,
    totalLessons: r.total_lessons,
    completedLessons: r.completed_lessons,
    percent: r.status === "completed" ? 100 : progressPercent(r.completed_lessons, r.total_lessons),
  }));
}

export async function getSavedCourses(supabase: SupabaseClient): Promise<SavedItem[]> {
  const { data, error } = await supabase.rpc("my_saved_courses");
  if (error) throw new Error(`my_saved_courses failed: ${error.message}`);
  return (
    (data ?? []) as {
      course_id: string;
      slug: string;
      title: string;
      subtitle: string | null;
      level: string;
      duration_minutes: number;
      price_cents: number;
      currency: string;
    }[]
  ).map((r) => ({
    courseId: r.course_id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    level: r.level,
    durationMinutes: r.duration_minutes,
    priceCents: r.price_cents,
    currency: r.currency,
  }));
}
