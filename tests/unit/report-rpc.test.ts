import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAGE_SIZE, REPORT_ROW_LIMIT, rpcAllRows } from "@/features/admin/report-rpc";
import { generateReportCsv } from "@/features/admin/report-generation";

// A stand-in for supabase.rpc(fn, args).range(from, to) over `total` rows, capped per page like PostgREST.
function fakeRpc(total: number, opts: { failOnPage?: number } = {}) {
  const calls: [number, number][] = [];
  const client = {
    rpc: () => ({
      range: async (from: number, to: number) => {
        calls.push([from, to]);
        if (opts.failOnPage !== undefined && from / PAGE_SIZE === opts.failOnPage) return { data: null, error: { message: "boom" } };
        const end = Math.min(total, to + 1);
        const data = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ user_id: `u${from + i}` }));
        return { data, error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("rpcAllRows", () => {
  it("reads past the 1000-row API cap until a short page", async () => {
    const { client, calls } = fakeRpc(2500);
    const rows = await rpcAllRows(client, "admin_report_idle_users", { p_days: 30 });
    expect(rows).toHaveLength(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after one call when the first page is short", async () => {
    const { client, calls } = fakeRpc(3);
    expect(await rpcAllRows(client, "fn")).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  it("stops at the report row limit", async () => {
    const { client } = fakeRpc(REPORT_ROW_LIMIT + 5000);
    expect(await rpcAllRows(client, "fn")).toHaveLength(REPORT_ROW_LIMIT);
  });

  it("throws with the function name when a page fails", async () => {
    const { client } = fakeRpc(2500, { failOnPage: 1 });
    await expect(rpcAllRows(client, "admin_report_user_progress")).rejects.toThrow("admin_report_user_progress failed: boom");
  });
});

describe("generateReportCsv", () => {
  it("returns an error result instead of throwing when the query fails", async () => {
    const { client } = fakeRpc(10, { failOnPage: 0 });
    const res = await generateReportCsv(client, { type: "idle_users", rangeDays: 30 });
    expect(res).toEqual({ ok: false, error: "We could not generate this report. Please try again." });
  });

  it("flags a report whose query reached the row limit", async () => {
    const { client } = fakeRpc(REPORT_ROW_LIMIT);
    const res = await generateReportCsv(client, { type: "idle_users", rangeDays: 30 });
    expect(res.ok && res.truncated).toBe(true);
    expect(res.ok && res.rowCount).toBe(REPORT_ROW_LIMIT);
  });

  it("does not flag a report under the limit", async () => {
    const { client } = fakeRpc(1500);
    const res = await generateReportCsv(client, { type: "idle_users", rangeDays: 30 });
    expect(res.ok && res.truncated).toBe(false);
    expect(res.ok && res.rowCount).toBe(1500);
  });
});
