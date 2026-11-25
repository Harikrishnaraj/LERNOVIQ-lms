import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The cron isolates each due report: one that throws or fails to record is skipped (and keeps its
// next_run_at), the rest still run, and the retention purge always runs.

const due = [
  { id: "r1", report_type: "idle_users", range_days: 30, filters: {}, schedule: "daily" },
  { id: "r2", report_type: "idle_users", range_days: 30, filters: {}, schedule: "daily" },
  { id: "r3", report_type: "idle_users", range_days: 30, filters: {}, schedule: "daily" },
];
const advanced: string[] = [];
const removed: string[][] = [];
let insertFails = new Set<string>();

vi.mock("@/services/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "saved_reports") {
        return {
          select: () => ({ neq: () => ({ lte: async () => ({ data: due, error: null }) }) }),
          update: () => ({ eq: async (_c: string, id: string) => { advanced.push(id); return { error: null }; } }),
        };
      }
      // report_exports insert
      return {
        insert: (row: { saved_report_id: string }) => ({
          select: () => ({
            single: async () =>
              insertFails.has(row.saved_report_id)
                ? { data: null, error: { message: "insert failed" } }
                : { data: { id: `x-${row.saved_report_id}` }, error: null },
          }),
        }),
      };
    },
  }),
}));

const generate = vi.fn();
vi.mock("@/features/admin/report-generation", () => ({ generateReportCsv: (...a: unknown[]) => generate(...a) }));
vi.mock("@/services/storage", () => ({
  REPORT_EXPORT_BUCKET: "report-exports",
  supabaseStorage: {
    upload: vi.fn(async () => {}),
    remove: vi.fn(async (_b: string, paths: string[]) => { removed.push(paths); }),
  },
}));
const purge = vi.fn(async () => 2);
vi.mock("@/features/admin/report-export-policy", () => ({
  logReportEvent: vi.fn(async () => {}),
  purgeExpiredExports: () => purge(),
}));

import { GET } from "@/app/api/cron/scheduled-reports/route";

const request = () => new NextRequest("http://localhost/api/cron/scheduled-reports", { headers: { authorization: "Bearer s3cret" } });

describe("scheduled reports cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
    advanced.length = 0;
    removed.length = 0;
    insertFails = new Set();
    generate.mockReset();
    purge.mockClear();
  });

  it("keeps going after a report throws, and still purges", async () => {
    generate
      .mockRejectedValueOnce(new Error("subquery returned more than one row"))
      .mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    const body = await (await GET(request())).json();
    expect(body).toEqual({ processed: 2, failed: 1, purged: 2 });
    expect(advanced).toEqual(["r2", "r3"]);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it("does not advance a report whose export could not be recorded, and removes its file", async () => {
    generate.mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    insertFails = new Set(["r2"]);
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ processed: 2, failed: 1 });
    expect(advanced).toEqual(["r1", "r3"]);
    expect(removed).toHaveLength(1);
    expect(removed[0][0]).toMatch(/^scheduled\/r2\//);
  });

  it("refuses a report whose stored filters are no longer valid, without widening it (report audit C19)", async () => {
    generate.mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    due[1] = { ...due[1], filters: { userId: "not-a-uuid" } };
    try {
      const body = await (await GET(request())).json();
      expect(body).toMatchObject({ processed: 2, failed: 1 });
      expect(advanced).toEqual(["r1", "r3"]);
      expect(generate).toHaveBeenCalledTimes(2);
    } finally {
      due[1] = { ...due[1], filters: {} };
    }
  });

  it("does not advance a report that failed to generate", async () => {
    generate.mockResolvedValueOnce({ ok: false, error: "nope" }).mockResolvedValue({ ok: true, csv: "", rowCount: 0, truncated: false });
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ processed: 2, failed: 1 });
    expect(advanced).toEqual(["r2", "r3"]);
  });
});
