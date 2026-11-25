import type { SupabaseClient } from "@supabase/supabase-js";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(raw: string | string[] | undefined): Range {
  const v = Number.parseInt((Array.isArray(raw) ? raw[0] : raw) ?? "", 10);
  return (RANGES as readonly number[]).includes(v) ? (v as Range) : 30;
}

export interface DailyPoint {
  day: string;
  enrollments: number;
  completions: number;
  signups: number;
}

export interface TopCourse {
  courseId: string;
  title: string;
  enrollments: number;
  completions: number;
}

/** One row per day of the range, zero-filled by the database. Needs analytics.read. */
export async function getDailyAnalytics(supabase: SupabaseClient, days: number): Promise<DailyPoint[]> {
  const { data, error } = await supabase.rpc("admin_analytics_daily", { p_days: days });
  if (error) throw new Error(`admin_analytics_daily failed: ${error.message}`);
  return ((data ?? []) as { day: string; enrollments: number; completions: number; signups: number }[]).map((r) => ({
    day: r.day,
    enrollments: r.enrollments,
    completions: r.completions,
    signups: r.signups,
  }));
}

export async function getTopCourses(supabase: SupabaseClient, days: number, limit = 5): Promise<TopCourse[]> {
  const { data, error } = await supabase.rpc("admin_top_courses", { p_days: days, p_limit: limit });
  if (error) throw new Error(`admin_top_courses failed: ${error.message}`);
  return ((data ?? []) as { course_id: string; title: string | null; enrollments: number; completions: number }[]).map((r) => ({
    courseId: r.course_id,
    title: r.title ?? "Untitled course",
    enrollments: r.enrollments,
    completions: r.completions,
  }));
}

export interface Totals {
  enrollments: number;
  /** Of those enrollments, how many have completed. */
  completions: number;
  signups: number;
  /** completions / enrollments as 0-100, or null with no enrollments. Cannot exceed 100. */
  completionRate: number | null;
}

/** Non-cancelled enrollments that started in the range, and how many of them have completed. */
export interface CompletionCohort {
  enrollments: number;
  completed: number;
}

/** Needs analytics.read. */
export async function getCompletionCohort(supabase: SupabaseClient, days: number): Promise<CompletionCohort> {
  const { data, error } = await supabase.rpc("admin_analytics_cohort", { p_days: days });
  if (error) throw new Error(`admin_analytics_cohort failed: ${error.message}`);
  const row = ((data ?? []) as { enrollments: number; completed: number }[])[0];
  return { enrollments: row?.enrollments ?? 0, completed: row?.completed ?? 0 };
}

/**
 * KPI totals. Enrollments, completions and the rate describe one cohort (enrollments that started
 * in the range), so the rate cannot exceed 100%. The daily chart still shows completion events.
 */
export function summarize(points: DailyPoint[], cohort: CompletionCohort): Totals {
  return {
    enrollments: cohort.enrollments,
    completions: cohort.completed,
    signups: points.reduce((n, p) => n + p.signups, 0),
    completionRate: cohort.enrollments === 0 ? null : Math.round((cohort.completed / cohort.enrollments) * 100),
  };
}

/** Bar heights (0-100) for a series, scaled to the largest value across the given series. */
export function scaleBars(series: number[][]): number[][] {
  const max = Math.max(1, ...series.flat());
  return series.map((s) => s.map((v) => (v === 0 ? 0 : Math.max(3, Math.round((v / max) * 100)))));
}
