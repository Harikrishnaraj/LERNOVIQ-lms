import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The cron claims each due report (moves next_run_at on, only if nobody else did), isolates it: one
// that throws or fails to record gets its old next_run_at back, the rest still run, and the
// retention purge always runs.

const DUE_AT = "2026-11-25T09:00:00+00:00";
const base = { report_type: "idle_users", range_days: 30, filters: {}, schedule: "daily", next_run_at: DUE_AT, created_at: "2026-11-01T09:00:00+00:00" };
const due = [
  { id: "r1", ...base },
  { id: "r2", ...base },
  { id: "r3", ...base },
];
// Every conditional next_run_at update: the claims, then any restores.
const updates: { id: string; from: string; to: string }[] = [];
const removed: string[][] = [];
let insertFails = new Set<string>();
let lostClaims = new Set<string>();
/** Reports whose next_run_at ended up moved on: claimed and not restored. */
const advanced = () => {
  const restored = new Set(updates.filter((u) => u.to === DUE_AT).map((u) => u.id));
  return updates.filter((u) => u.from === DUE_AT && !restored.has(u.id)).map((u) => u.id);
};

vi.mock("@/services/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "saved_reports") {
        return {
          select: () => ({ neq: () => ({ lte: async () => ({ data: due, error: null }) }) }),
          update: (row: { next_run_at: string }) => ({
            eq: (_c: string, id: string) => ({
              eq: (_c2: string, from: string) => ({
                select: async () => {
                  // Another run already moved this report on: the conditional update matches nothing.
                  if (from === DUE_AT && lostClaims.has(id)) return { data: [], error: null };
                  updates.push({ id, from, to: row.next_run_at });
                  return { data: [{ id }], error: null };
                },
              }),
            }),
          }),
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
    updates.length = 0;
    lostClaims = new Set();
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
    expect(body).toEqual({ processed: 2, failed: 1, skipped: 0, purged: 2 });
    expect(advanced()).toEqual(["r2", "r3"]);
    expect(purge).toHaveBeenCalledTimes(1);
  });

  it("does not advance a report whose export could not be recorded, and removes its file", async () => {
    generate.mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    insertFails = new Set(["r2"]);
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ processed: 2, failed: 1 });
    expect(advanced()).toEqual(["r1", "r3"]);
    expect(removed).toHaveLength(1);
    expect(removed[0][0]).toMatch(/^scheduled\/r2\//);
  });

  it("refuses a report whose stored filters are no longer valid, without widening it (report audit C19)", async () => {
    generate.mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    due[1] = { ...due[1], filters: { userId: "not-a-uuid" } };
    try {
      const body = await (await GET(request())).json();
      expect(body).toMatchObject({ processed: 2, failed: 1 });
      expect(advanced()).toEqual(["r1", "r3"]);
      expect(generate).toHaveBeenCalledTimes(2);
    } finally {
      due[1] = { ...due[1], filters: {} };
    }
  });

  it("does not advance a report that failed to generate", async () => {
    generate.mockResolvedValueOnce({ ok: false, error: "nope" }).mockResolvedValue({ ok: true, csv: "", rowCount: 0, truncated: false });
    const body = await (await GET(request())).json();
    expect(body).toMatchObject({ processed: 2, failed: 1 });
    expect(advanced()).toEqual(["r2", "r3"]);
  });

  it("claims each report before generating it, keeping the time of day (report audit C28, C29)", async () => {
    generate.mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    await GET(request());
    expect(updates.filter((u) => u.from === DUE_AT)).toHaveLength(3);
    // Advanced from the stored next_run_at (09:00), not from when the cron ran.
    for (const u of updates) expect(u.to).toMatch(/T09:00:00\.000Z$/);
  });

  it("skips a report another run has already claimed (report audit C29)", async () => {
    generate.mockResolvedValue({ ok: true, csv: "a\n1", rowCount: 1, truncated: false });
    lostClaims = new Set(["r2"]);
    const body = await (await GET(request())).json();
    expect(body).toEqual({ processed: 2, failed: 0, skipped: 1, purged: 2 });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(advanced()).toEqual(["r1", "r3"]);
  });
});
