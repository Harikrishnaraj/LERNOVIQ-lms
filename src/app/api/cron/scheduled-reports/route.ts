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
 * is also safe to call manually — each run only processes reports whose next_run_at has passed, and
 * claims each one first, so overlapping runs never generate the same report twice.
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
    .select("id, report_type, range_days, filters, schedule, next_run_at, created_at")
    .neq("schedule", "none")
    .lte("next_run_at", now.toISOString());
  if (error) return new NextResponse(`Query failed: ${error.message}`, { status: 500 });

  let processed = 0;
  let failed = 0;
  let skipped = 0;
  for (const report of (due ?? []) as DueReport[]) {
    // Claim the report by moving next_run_at on, but only if it still holds the value read above:
    // an overlapping run (a manual call during the hourly one) gets no row back and skips it
    // (report audit C29).
    // Monthly runs keep the day of month the report was created on (report audit C28).
    const next = computeNextRunAt(report.schedule as ReportSchedule, now, new Date(report.next_run_at), new Date(report.created_at).getUTCDate())?.toISOString();
    if (!next) continue;
    const { data: claimed, error: claimError } = await admin
      .from("saved_reports")
      .update({ next_run_at: next })
      .eq("id", report.id)
      .eq("next_run_at", report.next_run_at)
      .select("id");
    if (claimError) {
      failed += 1;
      log.error("report.scheduled_claim_failed", { reportId: report.id, message: claimError.message });
      continue;
    }
    if (!claimed || claimed.length === 0) {
      skipped += 1;
      continue;
    }

    // Each report is isolated: one failure is logged and never stops the reports after it or the
    // retention purge below. A failed run gets its old next_run_at back, so the next run retries it.
    let ok = false;
    try {
      ok = await runScheduledReport(admin, report);
    } catch (err) {
      log.error("report.scheduled_run_failed", { reportId: report.id, message: err instanceof Error ? err.message : String(err) });
    }
    if (ok) {
      processed += 1;
      continue;
    }
    failed += 1;
    const { error: restoreError } = await admin
      .from("saved_reports")
      .update({ next_run_at: report.next_run_at })
      .eq("id", report.id)
      .eq("next_run_at", next)
      .select("id");
    if (restoreError) log.error("report.schedule_restore_failed", { reportId: report.id, message: restoreError.message });
  }

  // Retention: files older than the limit are deleted whether or not any report was due or failed.
  let purged = 0;
  try {
    purged = await purgeExpiredExports(admin, now);
  } catch (err) {
    log.error("report.purge_failed", { message: err instanceof Error ? err.message : String(err) });
  }

  return NextResponse.json({ processed, failed, skipped, purged });
}

type DueReport = { id: string; report_type: string; range_days: number; filters: unknown; schedule: string; next_run_at: string; created_at: string };

/** Generates, stores and records one claimed report. Returns false when it could not. */
async function runScheduledReport(admin: SupabaseClient, report: DueReport): Promise<boolean> {
  const filters = parseStoredFilters(report.report_type as ReportType, report.filters);
  if (!filters) {
    // Fail closed: never widen a filtered report to everyone (report audit C19).
    log.error("report.scheduled_invalid_filters", { reportId: report.id });
    return false;
  }
  const generated = await generateReportCsv(admin, {
    type: report.report_type as ReportType, rangeDays: report.range_days as Range, filters,
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
  return true;
}
