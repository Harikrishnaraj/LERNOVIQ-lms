import { beforeEach, describe, expect, it, vi } from "vitest";

// Deleting a saved report removes its export files first: the export records cascade with the
// report, after which the retention purge could never find the files (report audit C26). A failed
// file removal is logged and does not block the delete.

const calls: string[] = [];
let exportPaths: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) =>
      table === "report_exports"
        ? {
            select: () => ({
              eq: async () => {
                calls.push("lookup");
                return { data: exportPaths.map((storage_path) => ({ storage_path })), error: null };
              },
            }),
          }
        : {
            delete: () => ({
              eq: () => ({
                eq: () => ({
                  select: async () => {
                    calls.push("delete");
                    return { data: [{ report_type: "idle_users", range_days: 30 }], error: null };
                  },
                }),
              }),
            }),
          },
  }),
}));
vi.mock("@/lib/permissions/can", () => ({ can: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/rate-limit", () => ({ clientIp: async () => "127.0.0.1", rateLimit: async () => true, RATE_LIMITED_MESSAGE: "" }));
vi.mock("@/features/admin/report-generation", () => ({ generateReportCsv: vi.fn() }));
const remove = vi.fn<(bucket: string, paths: string[]) => Promise<void>>();
vi.mock("@/services/storage", () => ({
  REPORT_EXPORT_BUCKET: "report-exports",
  supabaseStorage: {
    remove: async (bucket: string, paths: string[]) => {
      calls.push("remove");
      return remove(bucket, paths);
    },
  },
}));
vi.mock("@/features/admin/report-export-policy", () => ({ EXPORT_LINK_SECONDS: 60, logExportDownload: vi.fn(), logReportEvent: vi.fn() }));
const logError = vi.fn();
vi.mock("@/lib/log", () => ({ log: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() } }));

import { deleteSavedReportAction } from "@/features/admin/report-actions";

describe("deleteSavedReportAction", () => {
  beforeEach(() => {
    calls.length = 0;
    exportPaths = [];
    remove.mockReset();
    remove.mockResolvedValue(undefined);
    logError.mockClear();
  });

  it("removes the report's export files, then deletes the report", async () => {
    exportPaths = ["u1/r1/1.csv", "scheduled/r1/2.csv"];
    expect(await deleteSavedReportAction("r1")).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith("report-exports", exportPaths);
    expect(calls).toEqual(["lookup", "remove", "delete"]);
  });

  it("does not call storage when the report has no exports", async () => {
    expect(await deleteSavedReportAction("r1")).toEqual({ ok: true });
    expect(remove).not.toHaveBeenCalled();
    expect(calls).toEqual(["lookup", "delete"]);
  });

  it("still deletes the report when removing the files fails, and logs it", async () => {
    exportPaths = ["u1/r1/1.csv"];
    remove.mockRejectedValue(new Error("storage down"));
    expect(await deleteSavedReportAction("r1")).toEqual({ ok: true });
    expect(calls).toEqual(["lookup", "remove", "delete"]);
    expect(logError).toHaveBeenCalledWith("report.delete_files_failed", expect.objectContaining({ reportId: "r1", count: 1 }));
  });
});
