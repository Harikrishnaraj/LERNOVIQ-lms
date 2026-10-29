import { parseStoredFilters, type ReportFilters } from "./report-filters";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyPoint, Range } from "./analytics";

export type ReportSchedule = "none" | "daily" | "weekly" | "monthly";

/** The three report categories from the report design document, in display order. */
export const REPORT_CATEGORIES = [
  { id: "user", label: "User reports" },
  { id: "consolidated", label: "Consolidated usage reports" },
  { id: "product", label: "Product reports" },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["id"];

/** Stored in `saved_reports.report_type`. Keep in step with the check constraint in the T-274 migration. */
export const REPORT_TYPES = [
  "daily_analytics",
  "idle_users",
  "user_product_duration",
  "individual_user_progress",
  "consolidated_course_module_usage",
  "consolidated_course_library_usage",
  "product_course_library_licence_status",
  "product_course_library_usage",
  "product_course_module_usage",
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export interface ReportDefinition {
  type: ReportType;
  category: ReportCategory;
  label: string;
  /** False until the report's data query exists. Unavailable reports are listed, but cannot be saved or run. */
  available: boolean;
}

/**
 * Every report the saved-report engine knows about. `daily_analytics` is the original platform CSV
 * (enrollments, completions and signups per day) and is the only report with real data today.
 */
export const REPORT_CATALOGUE: readonly ReportDefinition[] = [
  { type: "daily_analytics", category: "consolidated", label: "Daily platform analytics", available: true },
  { type: "idle_users", category: "user", label: "Idle users", available: true },
  // Unavailable until T-292 records time spent; lesson_progress only keeps a resume position.
  { type: "user_product_duration", category: "user", label: "User product duration", available: false },
  { type: "individual_user_progress", category: "user", label: "Individual user progress", available: true },
  { type: "consolidated_course_module_usage", category: "consolidated", label: "Course-module usage", available: true },
  { type: "consolidated_course_library_usage", category: "consolidated", label: "Course-library usage (by access date)", available: true },
  { type: "product_course_library_licence_status", category: "product", label: "Course-library licence status", available: true },
  { type: "product_course_library_usage", category: "product", label: "Course-library usage", available: true },
  { type: "product_course_module_usage", category: "product", label: "Course-module usage", available: true },
];

export const DEFAULT_REPORT_TYPE: ReportType = "daily_analytics";

export function getReportDefinition(type: string): ReportDefinition | null {
  return REPORT_CATALOGUE.find((r) => r.type === type) ?? null;
}

export function validateReportType(input: unknown): { ok: true; value: ReportType } | { ok: false; error: string } {
  const def = typeof input === "string" ? getReportDefinition(input) : null;
  if (!def) return { ok: false, error: "Choose a valid report type." };
  return { ok: true, value: def.type };
}

export interface SavedReport {
  id: string;
  name: string;
  reportType: ReportType;
  reportLabel: string;
  rangeDays: Range;
  filters: ReportFilters;
  schedule: ReportSchedule;
  nextRunAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  name: string;
  report_type: string;
  range_days: Range;
  filters: unknown;
  schedule: ReportSchedule;
  next_run_at: string | null;
  created_at: string;
}

export async function getSavedReports(supabase: SupabaseClient): Promise<SavedReport[]> {
  const { data, error } = await supabase
    .from("saved_reports")
    .select("id, name, report_type, range_days, filters, schedule, next_run_at, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`saved_reports failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => {
    const def = getReportDefinition(r.report_type) ?? getReportDefinition(DEFAULT_REPORT_TYPE)!;
    return {
      id: r.id,
      name: r.name,
      reportType: def.type,
      reportLabel: def.label,
      rangeDays: r.range_days,
      filters: parseStoredFilters(def.type, r.filters),
      schedule: r.schedule,
      nextRunAt: r.next_run_at,
      createdAt: r.created_at,
    };
  });
}

export interface ReportExport {
  id: string;
  generatedAt: string;
  storagePath: string;
  rowCount: number;
  triggeredBy: "manual" | "scheduled";
}

interface ExportRow {
  id: string;
  generated_at: string;
  storage_path: string;
  row_count: number;
  triggered_by: "manual" | "scheduled";
}

export async function getReportExports(supabase: SupabaseClient, savedReportId: string): Promise<ReportExport[]> {
  const { data, error } = await supabase
    .from("report_exports")
    .select("id, generated_at, storage_path, row_count, triggered_by")
    .eq("saved_report_id", savedReportId)
    .order("generated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`report_exports failed: ${error.message}`);
  return ((data ?? []) as ExportRow[]).map((r) => ({
    id: r.id,
    generatedAt: r.generated_at,
    storagePath: r.storage_path,
    rowCount: r.row_count,
    triggeredBy: r.triggered_by,
  }));
}

export function validateReportName(input: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a report name." };
  const value = input.trim();
  if (value === "") return { ok: false, error: "Enter a report name." };
  if (value.length > 150) return { ok: false, error: "Keep the name under 150 characters." };
  return { ok: true, value };
}

/** Next run time for a schedule, from a given moment. `null` for "none". */
export function computeNextRunAt(schedule: ReportSchedule, from: Date): Date | null {
  if (schedule === "none") return null;
  const next = new Date(from);
  if (schedule === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (schedule === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function escapeCsv(value: string | number | null): string {
  if (value === null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) return `"${str.replaceAll('"', '""')}"`;
  return str;
}

/** A text cell that starts with a formula character would run as a formula in Excel; prefix it so it stays text. */
function safeCell(value: string | number | null): string | number | null {
  return typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Shared CSV writer for the report catalogue: a header row, then one escaped line per row. */
export function buildCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header.join(","), ...rows.map((r) => r.map((c) => escapeCsv(safeCell(c))).join(","))].join("\n");
}

/** CSV of the daily analytics points behind a saved report (matches what /admin/analytics shows). */
export function buildReportCsv(points: DailyPoint[]): string {
  const header = "day,enrollments,completions,signups";
  const rows = points.map((p) => [p.day, p.enrollments, p.completions, p.signups].map(escapeCsv).join(","));
  return [header, ...rows].join("\n");
}
