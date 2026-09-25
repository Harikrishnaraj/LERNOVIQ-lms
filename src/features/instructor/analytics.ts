import type { SupabaseClient } from "@supabase/supabase-js";

export const ANALYTICS_RANGES = [7, 30, 90, 365] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseAnalyticsRange(raw: string | string[] | undefined): AnalyticsRange {
  const val = Number.parseInt((Array.isArray(raw) ? raw[0] : raw) ?? "", 10);
  return (ANALYTICS_RANGES as readonly number[]).includes(val) ? (val as AnalyticsRange) : 30;
}

export function parseCourseFilter(raw: string | string[] | undefined): string | null {
  const val = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!val || val === "all") return null;
  // Basic UUID format check
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

export interface InstructorAnalyticsCourse {
  id: string;
  title: string;
  slug: string;
}

export interface InstructorDailyPoint {
  day: string;
  enrollments: number;
  completions: number;
  activeLearners: number;
  revenueCents: number;
}

export interface InstructorCourseBreakdown {
  courseId: string;
  title: string;
  slug: string;
  enrollments: number;
  completions: number;
  completionRate: number;
  activeLearners: number;
  revenueCents: number;
}

export interface InstructorAnalyticsTotals {
  totalEnrollments: number;
  totalCompletions: number;
  completionRate: number | null;
  activeLearners: number;
  totalRevenueCents: number;
  avgRevenuePerLearnerCents: number;
}

export function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function summarizeInstructorAnalytics(
  points: InstructorDailyPoint[],
  breakdown: InstructorCourseBreakdown[],
): InstructorAnalyticsTotals {
  const totalEnrollments = points.reduce((sum, p) => sum + p.enrollments, 0);
  const totalCompletions = points.reduce((sum, p) => sum + p.completions, 0);
  const totalRevenueCents = points.reduce((sum, p) => sum + p.revenueCents, 0);

  // Active learners across the courses in the period (max of daily active or sum of course active deduplicated best-effort)
  const maxDailyActive = Math.max(0, ...points.map((p) => p.activeLearners));
  const sumCourseActive = breakdown.reduce((sum, c) => sum + c.activeLearners, 0);
  const activeLearners = Math.max(maxDailyActive, sumCourseActive);

  const completionRate =
    totalEnrollments === 0
      ? null
      : Math.min(100, Math.round((totalCompletions / totalEnrollments) * 100));

  const avgRevenuePerLearnerCents =
    totalEnrollments === 0 ? 0 : Math.round(totalRevenueCents / totalEnrollments);

  return {
    totalEnrollments,
    totalCompletions,
    completionRate,
    activeLearners,
    totalRevenueCents,
    avgRevenuePerLearnerCents,
  };
}

export function scaleBars(series: number[][]): number[][] {
  const max = Math.max(1, ...series.flat());
  return series.map((s) => s.map((v) => (v === 0 ? 0 : Math.max(3, Math.round((v / max) * 100)))));
}

export async function getInstructorCourses(supabase: SupabaseClient): Promise<InstructorAnalyticsCourse[]> {
  const { data, error } = await supabase.rpc("instructor_analytics_courses");
  if (error) throw new Error(`instructor_analytics_courses failed: ${error.message}`);
  return ((data ?? []) as { id: string; title: string; slug: string }[]).map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
  }));
}

export async function getInstructorDailyAnalytics(
  supabase: SupabaseClient,
  days: number,
  courseId?: string | null,
): Promise<InstructorDailyPoint[]> {
  const { data, error } = await supabase.rpc("instructor_analytics_daily", {
    p_days: days,
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`instructor_analytics_daily failed: ${error.message}`);
  return ((data ?? []) as {
    day: string;
    enrollments: number;
    completions: number;
    active_learners: number;
    revenue_cents: number;
  }[]).map((r) => ({
    day: r.day,
    enrollments: r.enrollments,
    completions: r.completions,
    activeLearners: r.active_learners,
    revenueCents: r.revenue_cents,
  }));
}

export async function getInstructorCoursesBreakdown(
  supabase: SupabaseClient,
  days: number,
  courseId?: string | null,
): Promise<InstructorCourseBreakdown[]> {
  const { data, error } = await supabase.rpc("instructor_analytics_courses_breakdown", {
    p_days: days,
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`instructor_analytics_courses_breakdown failed: ${error.message}`);
  return ((data ?? []) as {
    course_id: string;
    title: string;
    slug: string;
    enrollments: number;
    completions: number;
    completion_rate: number;
    active_learners: number;
    revenue_cents: number;
  }[]).map((r) => ({
    courseId: r.course_id,
    title: r.title,
    slug: r.slug,
    enrollments: r.enrollments,
    completions: r.completions,
    completionRate: r.completion_rate,
    activeLearners: r.active_learners,
    revenueCents: r.revenue_cents,
  }));
}
