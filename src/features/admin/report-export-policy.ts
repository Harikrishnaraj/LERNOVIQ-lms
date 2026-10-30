import type { SupabaseClient } from "@supabase/supabase-js";
import { REPORT_EXPORT_BUCKET, supabaseStorage } from "@/services/storage";
import { recordAudit } from "@/services/audit";

// T-277 (F-423): how long a report export link lives and how long the files are kept.

/** A download link works for this long, then a new one must be requested (and is logged). */
export const EXPORT_LINK_SECONDS = 300;
/** Export files and their records are deleted after this many days. */
export const EXPORT_RETENTION_DAYS = 30;

export function exportCutoff(now: Date): Date {
  return new Date(now.getTime() - EXPORT_RETENTION_DAYS * 86_400_000);
}

/** Deletes exports older than the retention limit: the stored file first, then its record. Returns how many were removed. */
export async function purgeExpiredExports(admin: SupabaseClient, now: Date): Promise<number> {
  const { data, error } = await admin
    .from("report_exports")
    .select("id, storage_path")
    .lt("generated_at", exportCutoff(now).toISOString())
    .limit(500);
  if (error || !data || data.length === 0) return 0;
  await supabaseStorage.remove(REPORT_EXPORT_BUCKET, data.map((r) => r.storage_path as string));
  const { error: deleteError } = await admin.from("report_exports").delete().in("id", data.map((r) => r.id as string));
  return deleteError ? 0 : data.length;
}

/** Writes the audit row for a download link handed out. A failed audit write must not block the learner-facing action. */
export async function logExportDownload(args: {
  actorId: string;
  reportId: string;
  exportId: string | null;
  reportType: string;
  rowCount: number | null;
}): Promise<void> {
  await recordAudit({
    actorId: args.actorId,
    action: "report.downloaded",
    resourceType: "saved_report",
    resourceId: args.reportId,
    metadata: { exportId: args.exportId, reportType: args.reportType, rowCount: args.rowCount },
  });
}
