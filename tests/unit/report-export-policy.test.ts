import { describe, expect, it, vi } from "vitest";

const { recordAudit } = vi.hoisted(() => ({ recordAudit: vi.fn(async () => true) }));
vi.mock("@/services/audit", async (importActual) => ({ ...(await importActual<typeof import("@/services/audit")>()), recordAudit }));
vi.mock("@/services/storage", () => ({ REPORT_EXPORT_BUCKET: "report-exports", supabaseStorage: { remove: vi.fn() } }));

import { EXPORT_LINK_SECONDS, EXPORT_RETENTION_DAYS, exportCutoff, logExportDownload } from "@/features/admin/report-export-policy";
import { AUDIT_ACTIONS } from "@/services/audit";
import { buildIdleUsersCsv, buildUserDurationCsv, buildUserProgressCsv } from "@/features/admin/user-reports";

// F-423 (T-277): minimised PII, short-lived links, retention, every download logged.
describe("export policy", () => {
  it("keeps download links short-lived", () => {
    expect(EXPORT_LINK_SECONDS).toBeLessThanOrEqual(300);
  });

  it("computes the retention cutoff from the limit", () => {
    const now = new Date("2026-10-30T00:00:00Z");
    expect(exportCutoff(now).getTime()).toBe(now.getTime() - EXPORT_RETENTION_DAYS * 86_400_000);
    expect(EXPORT_RETENTION_DAYS).toBeLessThanOrEqual(90);
  });

  it("writes an audit row for each download with the report and export ids", async () => {
    await logExportDownload({ actorId: "u", reportId: "r", exportId: "e", reportType: "idle_users", rowCount: 4 });
    expect(recordAudit).toHaveBeenCalledWith({
      actorId: "u",
      action: "report.downloaded",
      resourceType: "saved_report",
      resourceId: "r",
      metadata: { exportId: "e", reportType: "idle_users", rowCount: 4 },
    });
    expect(AUDIT_ACTIONS).toContain("report.downloaded");
  });
});

describe("user report exports minimise personal data", () => {
  it("carry an id but no name or email column", () => {
    const csvs = [buildIdleUsersCsv([]), buildUserProgressCsv([]), buildUserDurationCsv([])];
    for (const csv of csvs) {
      const header = csv.split("\n")[0].split(",");
      expect(header).toContain("user_id");
      expect(header).not.toContain("name");
      expect(csv).not.toMatch(/email/i);
    }
  });
});
