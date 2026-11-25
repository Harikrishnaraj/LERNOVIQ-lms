import { parseStoredFilters } from "@/features/admin/report-filters";
import { NextResponse, type NextRequest } from "next/server";
import type { Range } from "@/features/admin/analytics";
import { generateReportCsv } from "@/features/admin/report-generation";
import { computeNextRunAt, type ReportSchedule, type ReportType } from "@/features/admin/reports";
import { logReportEvent, purgeExpiredExports } from "@/features/admin/report-export-policy";
import { REPORT_EXPORT_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";
import { log } from "@/lib/log";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Generates due scheduled report exports (ARCHITECTURE.md §15 "Scheduled reports"). Meant to be
 * invoked by an external scheduler (e.g. Vercel Cron) on a `CRON_SECRET`-authenticated request; it
 * is also safe to call manually — each run only processes reports whose next_run_at has passed.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const { data: due, error } = await admin
    .from("saved_reports")
    .select("id, report_type, range_days, filters, schedule")
    .neq("schedule", "none")
    .lte("next_run_at", now.toISOString());
  if (error) return new NextResponse(`Query failed: ${error.message}`, { status: 500 });

  let processed = 0;
  let failed = 0;
  for (const report of due ?? []) {
    // Each report is isolated: one failure is logged and retried next run (its next_run_at is not
    // advanced), and never stops the reports after it or the retention purge below.
    try {
      if (await runScheduledReport(admin, report, now)) processed += 1;
      else failed += 1;
    } catch (err) {
      failed += 1;
      log.error("report.scheduled_run_failed", { reportId: report.id, message: err instanceof Error ? err.message : String(err) });
    }
  }

  // Retention: files older than the limit are deleted whether or not any report was due or failed.
  let purged = 0;
  try {
    purged = await purgeExpiredExports(admin, now);
  } catch (err) {
    log.error("report.purge_failed", { message: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ processed, failed, purged });
}

type DueReport = { id: string; report_type: string; range_days: number; filters: unknown; schedule: string };

/** Generates, stores and records one due report. Returns false (leaving next_run_at alone) when it could not. */
async function runScheduledReport(admin: SupabaseClient, report: DueReport, now: Date): Promise<boolean> {
  const generated = await generateReportCsv(admin, {
    type: report.report_type as ReportType, rangeDays: report.range_days as Range,
    filters: parseStoredFilters(report.report_type as ReportType, report.filters),
  });
  if (!generated.ok) return false;
  const path = `scheduled/${report.id}/${Date.now()}.csv`;
  await supabaseStorage.upload(REPORT_EXPORT_BUCKET, path, new TextEncoder().encode(generated.csv), "text/csv");
  const { data: exportRow, error } = await admin
    .from("report_exports")
    .insert({ saved_report_id: report.id, storage_path: path, row_count: generated.rowCount, triggered_by: "scheduled" })
    .select("id")
    .single();
  if (error || !exportRow) {
    // Without a record the file could never be listed or purged.
    await supabaseStorage.remove(REPORT_EXPORT_BUCKET, [path]).catch(() => {});
    log.error("report.scheduled_record_failed", { reportId: report.id, message: error?.message ?? "no row" });
    return false;
  }
  await logReportEvent({
    action: "report.scheduled_run",
    actorId: null,
    reportId: report.id,
    reportType: report.report_type,
    rangeDays: report.range_days,
    rowCount: generated.rowCount,
    exportId: exportRow.id as string,
  });
  if (generated.truncated) log.warn("report.scheduled_truncated", { reportId: report.id, rowCount: generated.rowCount });
  const next = computeNextRunAt(report.schedule as ReportSchedule, now);
  const { error: scheduleError } = await admin
    .from("saved_reports")
    .update({ next_run_at: next ? next.toISOString() : null })
    .eq("id", report.id);
  if (scheduleError) log.error("report.schedule_advance_failed", { reportId: report.id, message: scheduleError.message });
  return true;
}
