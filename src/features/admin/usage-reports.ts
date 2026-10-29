import type { SupabaseClient } from "@supabase/supabase-js";
import { licenceStatus } from "@/features/content-server/rules";
import { buildCsv } from "./reports";

// T-276 (F-420): consolidated usage and product reports. Each is a security-definer RPC gated on
// analytics.read (or the service role for the cron), see 20261016200000_usage_reports.sql.
// "Module" is a lesson; "library" is a content-server licence. No email or learner key is returned.

async function rpcRows<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn} failed: ${error.message}`);
  return (data ?? []) as T[];
}

// ------------------------------------------------------------------ module usage

export interface ModuleUsageRow {
  courseId: string;
  courseTitle: string;
  sectionTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonType: string;
  learnersAccessed: number;
  learnersCompleted: number;
  lastAccessedAt: string;
}

interface ModuleUsageDb {
  course_id: string;
  course_title: string;
  section_title: string;
  lesson_id: string;
  lesson_title: string;
  lesson_type: string;
  learners_accessed: number;
  learners_completed: number;
  last_accessed_at: string;
}

/** Lessons accessed in the last `days` days (access date = progress update), with learner counts. */
export async function getModuleUsage(supabase: SupabaseClient, days: number): Promise<ModuleUsageRow[]> {
  const rows = await rpcRows<ModuleUsageDb>(supabase, "admin_report_module_usage", { p_days: days });
  return rows.map((r) => ({
    courseId: r.course_id,
    courseTitle: r.course_title,
    sectionTitle: r.section_title,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    lessonType: r.lesson_type,
    learnersAccessed: r.learners_accessed,
    learnersCompleted: r.learners_completed,
    lastAccessedAt: r.last_accessed_at,
  }));
}

export function buildModuleUsageCsv(rows: ModuleUsageRow[]): string {
  return buildCsv(
    ["course_id", "course", "section", "lesson_id", "lesson", "type", "learners_accessed", "learners_completed", "last_accessed_at"],
    rows.map((r) => [
      r.courseId, r.courseTitle, r.sectionTitle, r.lessonId, r.lessonTitle, r.lessonType,
      r.learnersAccessed, r.learnersCompleted, r.lastAccessedAt,
    ]),
  );
}

export interface ProductModuleUsageRow {
  courseId: string;
  courseTitle: string;
  sectionTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonType: string;
  learnersEnrolled: number;
  learnersStarted: number;
  learnersCompleted: number;
}

interface ProductModuleUsageDb {
  course_id: string;
  course_title: string;
  section_title: string;
  lesson_id: string;
  lesson_title: string;
  lesson_type: string;
  learners_enrolled: number;
  learners_started: number;
  learners_completed: number;
}

/** Every lesson of a course that has enrolments, over all time. */
export async function getProductModuleUsage(supabase: SupabaseClient): Promise<ProductModuleUsageRow[]> {
  const rows = await rpcRows<ProductModuleUsageDb>(supabase, "admin_report_product_module_usage");
  return rows.map((r) => ({
    courseId: r.course_id,
    courseTitle: r.course_title,
    sectionTitle: r.section_title,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    lessonType: r.lesson_type,
    learnersEnrolled: r.learners_enrolled,
    learnersStarted: r.learners_started,
    learnersCompleted: r.learners_completed,
  }));
}

export function buildProductModuleUsageCsv(rows: ProductModuleUsageRow[]): string {
  return buildCsv(
    ["course_id", "course", "section", "lesson_id", "lesson", "type", "learners_enrolled", "learners_started", "learners_completed"],
    rows.map((r) => [
      r.courseId, r.courseTitle, r.sectionTitle, r.lessonId, r.lessonTitle, r.lessonType,
      r.learnersEnrolled, r.learnersStarted, r.learnersCompleted,
    ]),
  );
}

// ------------------------------------------------------------------ library usage

export interface LibraryUsageRow {
  day: string;
  clientName: string;
  licenceName: string;
  courseId: string;
  courseTitle: string | null;
  launches: number;
  learners: number;
}

interface LibraryUsageDb {
  day: string;
  client_name: string;
  licence_name: string;
  course_id: string;
  course_title: string | null;
  launches: number;
  learners: number;
}

/** Content-server launches per day, licence and course in the last `days` days. */
export async function getLibraryUsage(supabase: SupabaseClient, days: number): Promise<LibraryUsageRow[]> {
  const rows = await rpcRows<LibraryUsageDb>(supabase, "admin_report_library_usage", { p_days: days });
  return rows.map((r) => ({
    day: r.day,
    clientName: r.client_name,
    licenceName: r.licence_name,
    courseId: r.course_id,
    courseTitle: r.course_title,
    launches: r.launches,
    learners: r.learners,
  }));
}

export function buildLibraryUsageCsv(rows: LibraryUsageRow[]): string {
  return buildCsv(
    ["date", "customer", "licence", "course_id", "course", "launches", "learners"],
    rows.map((r) => [r.day, r.clientName, r.licenceName, r.courseId, r.courseTitle, r.launches, r.learners]),
  );
}

export interface ProductLibraryUsageRow {
  clientName: string;
  licenceName: string;
  courseId: string;
  courseTitle: string | null;
  registrations: number;
  launches: number;
  firstLaunchAt: string | null;
  lastLaunchAt: string | null;
}

interface ProductLibraryUsageDb {
  client_name: string;
  licence_name: string;
  course_id: string;
  course_title: string | null;
  registrations: number;
  launches: number;
  first_launch_at: string | null;
  last_launch_at: string | null;
}

/** Totals per licence and course over all time, including courses never launched. */
export async function getProductLibraryUsage(supabase: SupabaseClient): Promise<ProductLibraryUsageRow[]> {
  const rows = await rpcRows<ProductLibraryUsageDb>(supabase, "admin_report_product_library_usage");
  return rows.map((r) => ({
    clientName: r.client_name,
    licenceName: r.licence_name,
    courseId: r.course_id,
    courseTitle: r.course_title,
    registrations: r.registrations,
    launches: r.launches,
    firstLaunchAt: r.first_launch_at,
    lastLaunchAt: r.last_launch_at,
  }));
}

export function buildProductLibraryUsageCsv(rows: ProductLibraryUsageRow[]): string {
  return buildCsv(
    ["customer", "licence", "course_id", "course", "learners_registered", "launches", "first_launch_at", "last_launch_at"],
    rows.map((r) => [
      r.clientName, r.licenceName, r.courseId, r.courseTitle, r.registrations, r.launches, r.firstLaunchAt, r.lastLaunchAt,
    ]),
  );
}

// ------------------------------------------------------------------ licence status

export interface LicenceStatusRow {
  clientName: string;
  licenceId: string;
  licenceName: string;
  status: "active" | "revoked" | "expired";
  expiresAt: string | null;
  revokedAt: string | null;
  seatLimit: number | null;
  seatsUsed: number;
  courses: number;
  createdAt: string;
}

interface LicenceStatusDb {
  client_name: string;
  licence_id: string;
  licence_name: string;
  expires_at: string | null;
  revoked_at: string | null;
  seat_limit: number | null;
  seats_used: number;
  courses: number;
  created_at: string;
}

/** One row per licence; the status is worked out here by the same rule the launch check uses. */
export async function getLicenceStatusReport(supabase: SupabaseClient, now = new Date()): Promise<LicenceStatusRow[]> {
  const rows = await rpcRows<LicenceStatusDb>(supabase, "admin_report_library_licence_status");
  return rows.map((r) => ({
    clientName: r.client_name,
    licenceId: r.licence_id,
    licenceName: r.licence_name,
    status: licenceStatus({ revokedAt: r.revoked_at, expiresAt: r.expires_at }, now),
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
    seatLimit: r.seat_limit,
    seatsUsed: r.seats_used,
    courses: r.courses,
    createdAt: r.created_at,
  }));
}

export function buildLicenceStatusCsv(rows: LicenceStatusRow[]): string {
  return buildCsv(
    ["customer", "licence_id", "licence", "status", "expires_at", "revoked_at", "seat_limit", "seats_used", "courses", "created_at"],
    rows.map((r) => [
      r.clientName, r.licenceId, r.licenceName, r.status, r.expiresAt, r.revokedAt, r.seatLimit, r.seatsUsed, r.courses, r.createdAt,
    ]),
  );
}
