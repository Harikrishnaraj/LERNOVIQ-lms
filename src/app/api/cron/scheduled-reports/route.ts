import { NextResponse, type NextRequest } from "next/server";
import type { Range } from "@/features/admin/analytics";
import { generateReportCsv } from "@/features/admin/report-generation";
import { computeNextRunAt, type ReportSchedule, type ReportType } from "@/features/admin/reports";
import { REPORT_EXPORT_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";

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
    .select("id, report_type, range_days, schedule")
    .neq("schedule", "none")
    .lte("next_run_at", now.toISOString());
  if (error) return new NextResponse(`Query failed: ${error.message}`, { status: 500 });

  let processed = 0;
  for (const report of due ?? []) {
    // A report that cannot be generated keeps its next_run_at, so it is retried on the next run
    // rather than silently skipped.
    const generated = await generateReportCsv(admin, { type: report.report_type as ReportType, rangeDays: report.range_days as Range });
    if (!generated.ok) continue;
    const path = `scheduled/${report.id}/${Date.now()}.csv`;
    await supabaseStorage.upload(REPORT_EXPORT_BUCKET, path, new TextEncoder().encode(generated.csv), "text/csv");
    await admin.from("report_exports").insert({
      saved_report_id: report.id,
      storage_path: path,
      row_count: generated.rowCount,
      triggered_by: "scheduled",
    });
    const next = computeNextRunAt(report.schedule as ReportSchedule, now);
    await admin.from("saved_reports").update({ next_run_at: next ? next.toISOString() : null }).eq("id", report.id);
    processed += 1;
  }

  return NextResponse.json({ processed });
}
