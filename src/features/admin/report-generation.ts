import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyAnalytics } from "./analytics";
import { buildReportCsv, getReportDefinition, type ReportType } from "./reports";
import {
  buildIdleUsersCsv,
  buildUserDurationCsv,
  buildUserProgressCsv,
  getIdleUsers,
  getUserProductDuration,
  getUserProgress,
} from "./user-reports";
import type { Range } from "./analytics";
import { matchRows, type ReportFilters } from "./report-filters";
import { PAGE_SIZE, REPORT_ROW_LIMIT } from "./report-rpc";
import { log } from "@/lib/log";
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

/** `truncated`: the data query reached its row limit, so the file may be missing rows. */
export type GenerateReportResult =
  | { ok: true; csv: string; rowCount: number; truncated: boolean }
  | { ok: false; error: string };

/**
 * The one generation path for saved reports, shared by the manual run and the scheduled cron.
 * Refuses any report type whose data query does not exist yet, so an unavailable report can never
 * produce a file.
 */
export async function generateReportCsv(
  supabase: SupabaseClient,
  report: { type: ReportType; rangeDays: Range; filters?: ReportFilters },
): Promise<GenerateReportResult> {
  try {
    return await generate(supabase, report);
  } catch (err) {
    // A failed query must come back as a message, not a thrown error that leaves the caller hanging.
    log.error("report.generate_failed", { type: report.type, message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "We could not generate this report. Please try again." };
  }
}

async function generate(
  supabase: SupabaseClient,
  report: { type: ReportType; rangeDays: Range; filters?: ReportFilters },
): Promise<GenerateReportResult> {
  const def = getReportDefinition(report.type);
  if (!def || !def.available) return { ok: false, error: "This report is not available yet." };

  const f = report.filters ?? {};
  // Organisation filter: keep users who belong to that organisation (RLS limits what the caller sees).
  let orgUsers: Set<string> | null = null;
  if (f.organizationId) {
    orgUsers = new Set();
    // Paged: one request stops at the API's 1000-row cap, which would drop members.
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", f.organizationId)
        .order("user_id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { ok: false, error: "We could not apply the organisation filter." };
      for (const m of data ?? []) orgUsers.add(m.user_id as string);
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }
  const inOrg = <T extends { userId: string }>(rows: T[]) => (orgUsers ? rows.filter((r) => orgUsers.has(r.userId)) : rows);

  const field = (row: unknown, key: string) => (row as Record<string, string | null>)[key];
  // Filters run after the query, so a source that hit its row limit may be missing matching rows.
  let truncated = false;
  const all = <T,>(rows: T[]): T[] => {
    if (rows.length >= REPORT_ROW_LIMIT) truncated = true;
    return rows;
  };

  switch (report.type) {
    case "daily_analytics": {
      const points = await getDailyAnalytics(supabase, report.rangeDays);
      return { ok: true, csv: buildReportCsv(points), rowCount: points.length, truncated: false };
    }
    case "idle_users": {
      const rows = matchRows(inOrg(all(await getIdleUsers(supabase, report.rangeDays))), { userId: f.userId }, field);
      return { ok: true, csv: buildIdleUsersCsv(rows), rowCount: rows.length, truncated };
    }
    case "user_product_duration": {
      const rows = matchRows(inOrg(all(await getUserProductDuration(supabase, report.rangeDays))), { userId: f.userId, courseId: f.courseId }, field);
      return { ok: true, csv: buildUserDurationCsv(rows), rowCount: rows.length, truncated };
    }
    case "individual_user_progress": {
      const rows = matchRows(inOrg(all(await getUserProgress(supabase, report.rangeDays))), { userId: f.userId, courseId: f.courseId, enrollmentStatus: f.status }, field);
      return { ok: true, csv: buildUserProgressCsv(rows), rowCount: rows.length, truncated };
    }
    case "consolidated_course_module_usage": {
      const rows = matchRows(all(await getModuleUsage(supabase, report.rangeDays)), { courseId: f.courseId }, field);
      return { ok: true, csv: buildModuleUsageCsv(rows), rowCount: rows.length, truncated };
    }
    case "consolidated_course_library_usage": {
      const rows = matchRows(all(await getLibraryUsage(supabase, report.rangeDays)), { courseId: f.courseId }, field);
      return { ok: true, csv: buildLibraryUsageCsv(rows), rowCount: rows.length, truncated };
    }
    case "product_course_library_licence_status": {
      const rows = matchRows(all(await getLicenceStatusReport(supabase)), { status: f.status }, field);
      return { ok: true, csv: buildLicenceStatusCsv(rows), rowCount: rows.length, truncated };
    }
    case "product_course_library_usage": {
      const rows = matchRows(all(await getProductLibraryUsage(supabase)), { courseId: f.courseId }, field);
      return { ok: true, csv: buildProductLibraryUsageCsv(rows), rowCount: rows.length, truncated };
    }
    case "product_course_module_usage": {
      const rows = matchRows(all(await getProductModuleUsage(supabase)), { courseId: f.courseId }, field);
      return { ok: true, csv: buildProductModuleUsageCsv(rows), rowCount: rows.length, truncated };
    }
    default:
      // Reached only when a type is marked available in REPORT_CATALOGUE without a generator.
      return { ok: false, error: "This report is not available yet." };
  }
}
