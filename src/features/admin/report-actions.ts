"use server";

import { revalidatePath } from "next/cache";
import type { Range } from "./analytics";
import { generateReportCsv } from "./report-generation";
import { EXPORT_LINK_SECONDS, logExportDownload, logReportEvent } from "./report-export-policy";
import { INVALID_STORED_FILTERS_ERROR, parseStoredFilters, validateFilters } from "./report-filters";
import { computeNextRunAt, getReportDefinition, reportFileName, validateReportName, validateReportType, type ReportSchedule, type ReportType } from "./reports";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { REPORT_EXPORT_BUCKET, supabaseStorage } from "@/services/storage";

export type ReportActionResult = { ok: true } | { ok: false; error: string };
/** `notice`: something the admin should know about an otherwise good file (e.g. it may be missing rows). */
export type RunReportResult = { ok: true; url: string; notice?: string } | { ok: false; error: string };

const RANGE_VALUES = [7, 30, 90];
const SCHEDULE_VALUES: ReportSchedule[] = ["none", "daily", "weekly", "monthly"];

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await can(supabase, user.id, "analytics.read"))) return null;
  return { supabase, user };
}

export async function createSavedReportAction(input: { name: string; reportType: string; rangeDays: number; schedule: string; filters?: unknown }): Promise<ReportActionResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const name = validateReportName(input.name);
  if (!name.ok) return name;
  const reportType = validateReportType(input.reportType);
  if (!reportType.ok) return reportType;
  if (!getReportDefinition(reportType.value)?.available) return { ok: false, error: "This report is not available yet." };
  const filters = validateFilters(reportType.value, input.filters);
  if (!filters.ok) return filters;
  if (!RANGE_VALUES.includes(input.rangeDays)) return { ok: false, error: "Choose a valid date range." };
  if (!SCHEDULE_VALUES.includes(input.schedule as ReportSchedule)) return { ok: false, error: "Choose a valid schedule." };
  const schedule = input.schedule as ReportSchedule;
  const nextRunAt = computeNextRunAt(schedule, new Date());

  const { data: created, error } = await ctx.supabase
    .from("saved_reports")
    .insert({
      owner_id: ctx.user.id,
      name: name.value,
      report_type: reportType.value,
      range_days: input.rangeDays,
      filters: filters.value,
      schedule,
      next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !created) return { ok: false, error: "We could not save that report. Please try again." };
  await logReportEvent({ action: "report.created", actorId: ctx.user.id, reportId: created.id as string, reportType: reportType.value, rangeDays: input.rangeDays });
  revalidatePath("/admin/analytics");
  return { ok: true };
}

export async function deleteSavedReportAction(reportId: string): Promise<ReportActionResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  const { data: deleted, error } = await ctx.supabase
    .from("saved_reports")
    .delete()
    .eq("id", reportId)
    .eq("owner_id", ctx.user.id)
    .select("report_type, range_days");
  if (error) return { ok: false, error: "We could not delete that report. Please try again." };
  for (const row of deleted ?? []) {
    await logReportEvent({ action: "report.deleted", actorId: ctx.user.id, reportId, reportType: row.report_type as string, rangeDays: row.range_days as number });
  }
  revalidatePath("/admin/analytics");
  return { ok: true };
}

/** Generates the CSV right now (manual trigger) and returns a short-lived download link. */
export async function runReportNowAction(reportId: string): Promise<RunReportResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("report-run", await clientIp(), ctx.user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { data: report } = await ctx.supabase
    .from("saved_reports")
    .select("id, name, report_type, range_days, filters")
    .eq("id", reportId)
    .eq("owner_id", ctx.user.id)
    .maybeSingle();
  if (!report) return { ok: false, error: "That report is not available." };
  const filters = parseStoredFilters(report.report_type as ReportType, report.filters);
  if (!filters) return { ok: false, error: INVALID_STORED_FILTERS_ERROR };

  const generated = await generateReportCsv(ctx.supabase, {
    type: report.report_type as ReportType, rangeDays: report.range_days as Range, filters,
  });
  if (!generated.ok) return generated;
  const path = `${ctx.user.id}/${reportId}/${Date.now()}.csv`;
  try {
    await supabaseStorage.upload(REPORT_EXPORT_BUCKET, path, new TextEncoder().encode(generated.csv), "text/csv");
  } catch (err) {
    log.error("report.upload_failed", { reportId, message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: "We could not save that export. Please try again." };
  }

  const { data: exportRow, error } = await ctx.supabase
    .from("report_exports")
    .insert({
      saved_report_id: reportId,
      storage_path: path,
      row_count: generated.rowCount,
      triggered_by: "manual",
    })
    .select("id")
    .single();
  if (error || !exportRow) {
    // No record means the purge job would never find the file: remove it now.
    await supabaseStorage.remove(REPORT_EXPORT_BUCKET, [path]).catch(() => {});
    return { ok: false, error: "We could not record that export. Please try again." };
  }

  const url = await supabaseStorage.createSignedUrl(
    REPORT_EXPORT_BUCKET, path, EXPORT_LINK_SECONDS, reportFileName(report.name as string, new Date()),
  );
  await logReportEvent({
    action: "report.run",
    actorId: ctx.user.id,
    reportId,
    reportType: report.report_type as string,
    rangeDays: report.range_days as number,
    rowCount: generated.rowCount,
    exportId: exportRow.id as string,
  });
  await logExportDownload({
    actorId: ctx.user.id,
    reportId,
    exportId: exportRow.id as string,
    reportType: report.report_type as string,
    rowCount: generated.rowCount,
  });
  revalidatePath("/admin/analytics");
  return generated.truncated
    ? { ok: true, url, notice: "This report reached its 10,000-row limit, so the file may be missing rows. Add a filter to narrow it." }
    : { ok: true, url };
}

type SavedRef = { name: string; report_type: string };

/** A fresh short-lived download link for a past export. */
export async function getExportDownloadUrlAction(exportId: string): Promise<RunReportResult> {
  const ctx = await actor();
  if (!ctx) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("report-run", await clientIp(), ctx.user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const { data, error } = await ctx.supabase
    .from("report_exports")
    .select("storage_path, saved_report_id, row_count, generated_at, saved_reports!inner(owner_id, name, report_type)")
    .eq("id", exportId)
    .eq("saved_reports.owner_id", ctx.user.id)
    .maybeSingle();
  if (error) log.error("report.export_lookup_failed", { exportId, message: error.message });
  if (!data) return { ok: false, error: "That export is not available." };
  const saved = data.saved_reports as unknown as SavedRef | SavedRef[];
  const report = Array.isArray(saved) ? saved[0] : saved;
  const url = await supabaseStorage.createSignedUrl(
    REPORT_EXPORT_BUCKET, data.storage_path as string, EXPORT_LINK_SECONDS,
    reportFileName(report.name, new Date(data.generated_at as string)),
  );
  await logExportDownload({
    actorId: ctx.user.id,
    reportId: data.saved_report_id as string,
    exportId,
    reportType: report.report_type,
    rowCount: data.row_count as number,
  });
  return { ok: true, url };
}
