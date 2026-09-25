import type { SupabaseClient } from "@supabase/supabase-js";

export const ANALYTICS_RANGES = [7, 30, 90, 365] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseAnalyticsRange(raw: string | string[] | undefined): AnalyticsRange {
  const val = Number.parseInt((Array.isArray(raw) ? raw[0] : raw) ?? "", 10);
  return (ANALYTICS_RANGES as readonly number[]).includes(val) ? (val as AnalyticsRange) : 30;
}

export function parseCourseFilter(raw: string | string[] | undefined | null): string | null {
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

export interface InstructorLessonAnalytics {
  lessonId: string;
  lessonTitle: string;
  lessonType: string;
  sectionTitle: string;
  courseId: string;
  courseTitle: string;
  lessonPosition: number;
  durationMinutes: number;
  starts: number;
  completions: number;
  completionRate: number;
  dropOffRate: number;
  avgWatchSeconds: number;
}

export interface InstructorAssessmentAnalytics {
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  courseTitle: string;
  passMark: number;
  totalAttempts: number;
  totalLearners: number;
  passedAttempts: number;
  passRate: number;
  avgScore: number;
  avgAttempts: number;
}

export interface InstructorQuestionAnalytics {
  questionId: string;
  prompt: string;
  assessmentId: string;
  assessmentTitle: string;
  courseId: string;
  questionType: string;
  points: number;
  totalAttempts: number;
  passRate: number;
  difficulty: "easy" | "medium" | "hard";
}

export interface InstructorExportRow {
  learnerName: string;
  courseTitle: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  watchTimeMinutes: number;
  assessmentsPassed: number;
  lastActivityAt: string | null;
}

export function formatCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const remSecs = seconds % 60;
  if (mins === 0) return `${remSecs}s`;
  if (remSecs === 0) return `${mins}m`;
  return `${mins}m ${remSecs}s`;
}

export function summarizeInstructorAnalytics(
  points: InstructorDailyPoint[],
  breakdown: InstructorCourseBreakdown[],
): InstructorAnalyticsTotals {
  const totalEnrollments = points.reduce((sum, p) => sum + p.enrollments, 0);
  const totalCompletions = points.reduce((sum, p) => sum + p.completions, 0);
  const totalRevenueCents = points.reduce((sum, p) => sum + p.revenueCents, 0);

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

export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function exportToCsv(rows: InstructorExportRow[]): string {
  const headers = [
    "Learner Name",
    "Course Title",
    "Status",
    "Enrolled At",
    "Completed At",
    "Progress %",
    "Completed Lessons",
    "Total Lessons",
    "Watch Time (min)",
    "Assessments Passed",
    "Last Activity",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeCsv(r.learnerName),
        escapeCsv(r.courseTitle),
        escapeCsv(r.status),
        escapeCsv(r.enrolledAt),
        escapeCsv(r.completedAt),
        escapeCsv(r.progressPercent),
        escapeCsv(r.completedLessons),
        escapeCsv(r.totalLessons),
        escapeCsv(r.watchTimeMinutes),
        escapeCsv(r.assessmentsPassed),
        escapeCsv(r.lastActivityAt),
      ].join(","),
    );
  }
  return lines.join("\r\n");
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

export async function getInstructorLessonAnalytics(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorLessonAnalytics[]> {
  const { data, error } = await supabase.rpc("instructor_lesson_analytics", {
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`instructor_lesson_analytics failed: ${error.message}`);
  return ((data ?? []) as {
    lesson_id: string;
    lesson_title: string;
    lesson_type: string;
    section_title: string;
    course_id: string;
    course_title: string;
    lesson_position: number;
    duration_minutes: number;
    starts: number;
    completions: number;
    completion_rate: number;
    drop_off_rate: number;
    avg_watch_seconds: number;
  }[]).map((r) => ({
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    lessonType: r.lesson_type,
    sectionTitle: r.section_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    lessonPosition: r.lesson_position,
    durationMinutes: r.duration_minutes,
    starts: r.starts,
    completions: r.completions,
    completionRate: r.completion_rate,
    dropOffRate: r.drop_off_rate,
    avgWatchSeconds: r.avg_watch_seconds,
  }));
}

export async function getInstructorAssessmentAnalytics(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorAssessmentAnalytics[]> {
  const { data, error } = await supabase.rpc("instructor_assessment_analytics", {
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`instructor_assessment_analytics failed: ${error.message}`);
  return ((data ?? []) as {
    assessment_id: string;
    assessment_title: string;
    course_id: string;
    course_title: string;
    pass_mark: number;
    total_attempts: number;
    total_learners: number;
    passed_attempts: number;
    pass_rate: number;
    avg_score: number;
    avg_attempts: number;
  }[]).map((r) => ({
    assessmentId: r.assessment_id,
    assessmentTitle: r.assessment_title,
    courseId: r.course_id,
    courseTitle: r.course_title,
    passMark: r.pass_mark,
    totalAttempts: r.total_attempts,
    totalLearners: r.total_learners,
    passedAttempts: r.passed_attempts,
    passRate: r.pass_rate,
    avgScore: Number(r.avg_score),
    avgAttempts: Number(r.avg_attempts),
  }));
}

export async function getInstructorQuestionAnalytics(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorQuestionAnalytics[]> {
  const { data, error } = await supabase.rpc("instructor_question_analytics", {
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`instructor_question_analytics failed: ${error.message}`);
  return ((data ?? []) as {
    question_id: string;
    prompt: string;
    assessment_id: string;
    assessment_title: string;
    course_id: string;
    question_type: string;
    points: number;
    total_attempts: number;
    pass_rate: number;
    difficulty: "easy" | "medium" | "hard";
  }[]).map((r) => ({
    questionId: r.question_id,
    prompt: r.prompt,
    assessmentId: r.assessment_id,
    assessmentTitle: r.assessment_title,
    courseId: r.course_id,
    questionType: r.question_type,
    points: r.points,
    totalAttempts: r.total_attempts,
    passRate: r.pass_rate,
    difficulty: r.difficulty,
  }));
}

export async function getInstructorExportRows(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorExportRow[]> {
  const { data, error } = await supabase.rpc("instructor_analytics_export_rows", {
    p_course_id: courseId ?? null,
  });
  if (error) throw new Error(`instructor_analytics_export_rows failed: ${error.message}`);
  return ((data ?? []) as {
    learner_name: string;
    course_title: string;
    status: string;
    enrolled_at: string;
    completed_at: string | null;
    progress_percent: number;
    completed_lessons: number;
    total_lessons: number;
    watch_time_minutes: number;
    assessments_passed: number;
    last_activity_at: string | null;
  }[]).map((r) => ({
    learnerName: r.learner_name,
    courseTitle: r.course_title,
    status: r.status,
    enrolledAt: r.enrolled_at,
    completedAt: r.completed_at,
    progressPercent: r.progress_percent,
    completedLessons: r.completed_lessons,
    totalLessons: r.total_lessons,
    watchTimeMinutes: r.watch_time_minutes,
    assessmentsPassed: r.assessments_passed,
    lastActivityAt: r.last_activity_at,
  }));
}
