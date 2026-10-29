import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyAnalytics } from "./analytics";
import { buildReportCsv, getReportDefinition, type ReportType } from "./reports";
import { buildIdleUsersCsv, buildUserProgressCsv, getIdleUsers, getUserProgress } from "./user-reports";
import type { Range } from "./analytics";
import { matchRows, type ReportFilters } from "./report-filters";
import {
  buildLibraryUsageCsv,
  buildLicenceStatusCsv,
  buildModuleUsageCsv,
  buildProductLibraryUsageCsv,
  buildProductModuleUsageCsv,
  getLibraryUsage,
  getLicenceStatusReport,
  getModuleUsage,
  getProductLibraryUsage,
  getProductModuleUsage,
} from "./usage-reports";

export type GenerateReportResult = { ok: true; csv: string; rowCount: number } | { ok: false; error: string };

/**
 * The one generation path for saved reports, shared by the manual run and the scheduled cron.
 * Refuses any report type whose data query does not exist yet, so an unavailable report can never
 * produce a file.
 */
export async function generateReportCsv(
  supabase: SupabaseClient,
  report: { type: ReportType; rangeDays: Range; filters?: ReportFilters },
): Promise<GenerateReportResult> {
  const def = getReportDefinition(report.type);
  if (!def || !def.available) return { ok: false, error: "This report is not available yet." };

  const f = report.filters ?? {};
  // Organisation filter: keep users who belong to that organisation (RLS limits what the caller sees).
  let orgUsers: Set<string> | null = null;
  if (f.organizationId) {
    const { data, error } = await supabase.from("organization_members").select("user_id").eq("organization_id", f.organizationId);
    if (error) return { ok: false, error: "We could not apply the organisation filter." };
    orgUsers = new Set((data ?? []).map((m) => m.user_id as string));
  }
  const inOrg = <T extends { userId: string }>(rows: T[]) => (orgUsers ? rows.filter((r) => orgUsers.has(r.userId)) : rows);

  const field = (row: unknown, key: string) => (row as Record<string, string | null>)[key];

  switch (report.type) {
    case "daily_analytics": {
      const points = await getDailyAnalytics(supabase, report.rangeDays);
      return { ok: true, csv: buildReportCsv(points), rowCount: points.length };
    }
    case "idle_users": {
      const rows = matchRows(inOrg(await getIdleUsers(supabase, report.rangeDays)), { userId: f.userId }, field);
      return { ok: true, csv: buildIdleUsersCsv(rows), rowCount: rows.length };
    }
    case "individual_user_progress": {
      const rows = matchRows(inOrg(await getUserProgress(supabase, report.rangeDays)), { userId: f.userId, courseId: f.courseId, enrollmentStatus: f.status }, field);
      return { ok: true, csv: buildUserProgressCsv(rows), rowCount: rows.length };
    }
    case "consolidated_course_module_usage": {
      const rows = matchRows(await getModuleUsage(supabase, report.rangeDays), { courseId: f.courseId }, field);
      return { ok: true, csv: buildModuleUsageCsv(rows), rowCount: rows.length };
    }
    case "consolidated_course_library_usage": {
      const rows = matchRows(await getLibraryUsage(supabase, report.rangeDays), { courseId: f.courseId }, field);
      return { ok: true, csv: buildLibraryUsageCsv(rows), rowCount: rows.length };
    }
    case "product_course_library_licence_status": {
      const rows = matchRows(await getLicenceStatusReport(supabase), { status: f.status }, field);
      return { ok: true, csv: buildLicenceStatusCsv(rows), rowCount: rows.length };
    }
    case "product_course_library_usage": {
      const rows = matchRows(await getProductLibraryUsage(supabase), { courseId: f.courseId }, field);
      return { ok: true, csv: buildProductLibraryUsageCsv(rows), rowCount: rows.length };
    }
    case "product_course_module_usage": {
      const rows = matchRows(await getProductModuleUsage(supabase), { courseId: f.courseId }, field);
      return { ok: true, csv: buildProductModuleUsageCsv(rows), rowCount: rows.length };
    }
    default:
      // Reached only when a type is marked available in REPORT_CATALOGUE without a generator.
      return { ok: false, error: "This report is not available yet." };
  }
}
