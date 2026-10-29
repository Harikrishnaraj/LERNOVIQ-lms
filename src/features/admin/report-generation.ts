import type { SupabaseClient } from "@supabase/supabase-js";
import { getDailyAnalytics } from "./analytics";
import { buildReportCsv, getReportDefinition, type ReportType } from "./reports";
import type { Range } from "./analytics";

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
    default:
      // Reached only when a type is marked available in REPORT_CATALOGUE without a generator.
      return { ok: false, error: "This report is not available yet." };
  }
}
