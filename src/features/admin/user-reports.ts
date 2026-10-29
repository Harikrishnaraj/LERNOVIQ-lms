import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCsv } from "./reports";

export interface IdleUserRow {
  userId: string;
  fullName: string | null;
  lastActivityAt: string;
  daysIdle: number;
  enrollments: number;
}

interface IdleDbRow {
  user_id: string;
  full_name: string | null;
  last_activity_at: string;
  days_idle: number;
  enrollments: number;
}

/** Active users with no login, lesson or assessment activity for at least `days` days. Needs analytics.read. */
export async function getIdleUsers(supabase: SupabaseClient, days: number): Promise<IdleUserRow[]> {
  const { data, error } = await supabase.rpc("admin_report_idle_users", { p_days: days });
  if (error) throw new Error(`admin_report_idle_users failed: ${error.message}`);
  return ((data ?? []) as IdleDbRow[]).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    lastActivityAt: r.last_activity_at,
    daysIdle: r.days_idle,
    enrollments: r.enrollments,
  }));
}

export function buildIdleUsersCsv(rows: IdleUserRow[]): string {
  return buildCsv(
    ["user_id", "name", "last_activity_at", "days_idle", "enrollments"],
    rows.map((r) => [r.userId, r.fullName, r.lastActivityAt, r.daysIdle, r.enrollments]),
  );
}

export interface UserProgressRow {
  userId: string;
  fullName: string | null;
  courseId: string;
  courseTitle: string;
  enrollmentStatus: string;
  enrolledAt: string;
  completedAt: string | null;
  lessonsCompleted: number;
  lessonsTotal: number;
  assessmentsPassed: number;
  assessmentsTotal: number;
  bestAssessmentPercent: number | null;
  certificateStatus: string | null;
  lastActivityAt: string;
}

interface ProgressDbRow {
  user_id: string;
  full_name: string | null;
  course_id: string;
  course_title: string;
  enrollment_status: string;
  enrolled_at: string;
  completed_at: string | null;
  lessons_completed: number;
  lessons_total: number;
  assessments_passed: number;
  assessments_total: number;
  best_assessment_percent: number | string | null;
  certificate_status: string | null;
  last_activity_at: string;
}

/** One row per enrolment with activity in the last `days` days. Needs analytics.read. */
export async function getUserProgress(supabase: SupabaseClient, days: number): Promise<UserProgressRow[]> {
  const { data, error } = await supabase.rpc("admin_report_user_progress", { p_days: days });
  if (error) throw new Error(`admin_report_user_progress failed: ${error.message}`);
  return ((data ?? []) as ProgressDbRow[]).map((r) => ({
    userId: r.user_id,
    fullName: r.full_name,
    courseId: r.course_id,
    courseTitle: r.course_title,
    enrollmentStatus: r.enrollment_status,
    enrolledAt: r.enrolled_at,
    completedAt: r.completed_at,
    lessonsCompleted: r.lessons_completed,
    lessonsTotal: r.lessons_total,
    assessmentsPassed: r.assessments_passed,
    assessmentsTotal: r.assessments_total,
    bestAssessmentPercent: r.best_assessment_percent === null ? null : Number(r.best_assessment_percent),
    certificateStatus: r.certificate_status,
    lastActivityAt: r.last_activity_at,
  }));
}

/** Lessons completed as a whole percentage, or null for a course with no lessons. */
export function percentComplete(done: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

export function buildUserProgressCsv(rows: UserProgressRow[]): string {
  return buildCsv(
    [
      "user_id",
      "name",
      "course_id",
      "course",
      "status",
      "enrolled_at",
      "completed_at",
      "lessons_completed",
      "lessons_total",
      "percent_complete",
      "assessments_passed",
      "assessments_total",
      "best_assessment_percent",
      "certificate",
      "last_activity_at",
    ],
    rows.map((r) => [
      r.userId,
      r.fullName,
      r.courseId,
      r.courseTitle,
      r.enrollmentStatus,
      r.enrolledAt,
      r.completedAt,
      r.lessonsCompleted,
      r.lessonsTotal,
      percentComplete(r.lessonsCompleted, r.lessonsTotal),
      r.assessmentsPassed,
      r.assessmentsTotal,
      r.bestAssessmentPercent,
      r.certificateStatus,
      r.lastActivityAt,
    ]),
  );
}
