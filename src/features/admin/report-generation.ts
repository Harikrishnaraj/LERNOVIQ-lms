import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyAnalytics } from "./analytics";
import { buildReportCsv, getReportDefinition, type ReportType } from "./reports";
import { buildIdleUsersCsv, buildUserProgressCsv, getIdleUsers, getUserProgress } from "./user-reports";
import type { Range } from "./analytics";
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
  report: { type: ReportType; rangeDays: Range },
): Promise<GenerateReportResult> {
  const def = getReportDefinition(report.type);
  if (!def || !def.available) return { ok: false, error: "This report is not available yet." };

  switch (report.type) {
    case "daily_analytics": {
      const points = await getDailyAnalytics(supabase, report.rangeDays);
      return { ok: true, csv: buildReportCsv(points), rowCount: points.length };
    }
    case "idle_users": {
      const rows = await getIdleUsers(supabase, report.rangeDays);
      return { ok: true, csv: buildIdleUsersCsv(rows), rowCount: rows.length };
    }
    case "individual_user_progress": {
      const rows = await getUserProgress(supabase, report.rangeDays);
      return { ok: true, csv: buildUserProgressCsv(rows), rowCount: rows.length };
    }
    case "consolidated_course_module_usage": {
      const rows = await getModuleUsage(supabase, report.rangeDays);
      return { ok: true, csv: buildModuleUsageCsv(rows), rowCount: rows.length };
    }
    case "consolidated_course_library_usage": {
      const rows = await getLibraryUsage(supabase, report.rangeDays);
      return { ok: true, csv: buildLibraryUsageCsv(rows), rowCount: rows.length };
    }
    case "product_course_library_licence_status": {
      const rows = await getLicenceStatusReport(supabase);
      return { ok: true, csv: buildLicenceStatusCsv(rows), rowCount: rows.length };
    }
    case "product_course_library_usage": {
      const rows = await getProductLibraryUsage(supabase);
      return { ok: true, csv: buildProductLibraryUsageCsv(rows), rowCount: rows.length };
    }
    case "product_course_module_usage": {
      const rows = await getProductModuleUsage(supabase);
      return { ok: true, csv: buildProductModuleUsageCsv(rows), rowCount: rows.length };
    }
    default:
      // Reached only when a type is marked available in REPORT_CATALOGUE without a generator.
      return { ok: false, error: "This report is not available yet." };
  }
}
