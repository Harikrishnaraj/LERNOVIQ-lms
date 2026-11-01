import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportCsv } from "@/features/admin/report-generation";
import {
  buildLibraryUsageCsv,
  buildLicenceStatusCsv,
  buildModuleUsageCsv,
  buildProductLibraryUsageCsv,
  buildProductModuleUsageCsv,
  getLibraryUsage,
  getLicenceStatusReport,
  getModuleUsage,
} from "@/features/admin/usage-reports";

function fakeRpc(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("usage report CSV headers", () => {
  it("never include an email or learner key column", () => {
    const csvs = [
      buildModuleUsageCsv([]),
      buildProductModuleUsageCsv([]),
      buildLibraryUsageCsv([]),
      buildProductLibraryUsageCsv([]),
      buildLicenceStatusCsv([]),
    ];
    for (const csv of csvs) {
      expect(csv).not.toMatch(/email|learner_key/i);
      expect(csv.split("\n")).toHaveLength(1);
    }
  });

  it("writes a library usage line with a quoted customer name", () => {
    const csv = buildLibraryUsageCsv([
      { day: "2026-10-01", clientName: "Acme, Inc", licenceName: "2026", courseId: "c1", courseTitle: null, launches: 3, learners: 2 },
    ]);
    expect(csv.split("\n")[1]).toBe('2026-10-01,"Acme, Inc",2026,c1,,3,2');
  });
});

describe("usage report queries", () => {
  it("maps module usage rows and passes the range", async () => {
    const { client, rpc } = fakeRpc([
      {
        course_id: "c", course_title: "T", section_title: "S", lesson_id: "l", lesson_title: "L",
        lesson_type: "video", learners_accessed: 4, learners_completed: 1, last_accessed_at: "t",
      },
    ]);
    const rows = await getModuleUsage(client, 14);
    expect(rows[0]).toMatchObject({ lessonTitle: "L", learnersAccessed: 4, learnersCompleted: 1 });
    expect(rpc).toHaveBeenCalledWith("admin_report_module_usage", { p_days: 14 });
  });

  it("maps library usage rows", async () => {
    const { client } = fakeRpc([
      { day: "2026-10-01", client_name: "A", licence_name: "L", course_id: "c", course_title: "T", launches: 5, learners: 2 },
    ]);
    expect(await getLibraryUsage(client, 30)).toEqual([
      { day: "2026-10-01", clientName: "A", licenceName: "L", courseId: "c", courseTitle: "T", launches: 5, learners: 2 },
    ]);
  });

  it("throws when the database refuses", async () => {
    const { client } = fakeRpc(null, { message: "not allowed" });
    await expect(getModuleUsage(client, 30)).rejects.toThrow("admin_report_module_usage failed: not allowed");
  });
});

describe("licence status report", () => {
  const base = { client_name: "A", licence_id: "l", licence_name: "L", seat_limit: null, seats_used: 0, courses: 1, created_at: "t" };

  it("labels revoked, expired and active licences by the content-server rule", async () => {
    const { client } = fakeRpc([
      { ...base, licence_id: "1", expires_at: null, revoked_at: "2026-01-01T00:00:00Z" },
      { ...base, licence_id: "2", expires_at: "2026-02-01T00:00:00Z", revoked_at: null },
      { ...base, licence_id: "3", expires_at: "2027-01-01T00:00:00Z", revoked_at: null },
      { ...base, licence_id: "4", expires_at: null, revoked_at: null },
    ]);
    const rows = await getLicenceStatusReport(client, new Date("2026-06-01T00:00:00Z"));
    expect(rows.map((r) => r.status)).toEqual(["revoked", "expired", "active", "active"]);
  });

  it("puts the status in the CSV", () => {
    const csv = buildLicenceStatusCsv([
      {
        clientName: "A", licenceId: "l", licenceName: "L", status: "expired", expiresAt: "e", revokedAt: null,
        seatLimit: 10, seatsUsed: 3, courses: 2, createdAt: "c",
      },
    ]);
    expect(csv.split("\n")[1]).toBe("A,l,L,expired,e,,10,3,2,c");
  });
});

describe("generateReportCsv for the usage reports", () => {
  it.each([
    ["consolidated_course_module_usage", "admin_report_module_usage", { p_days: 30 }],
    ["consolidated_course_library_usage", "admin_report_library_usage", { p_days: 30 }],
    ["product_course_library_licence_status", "admin_report_library_licence_status", undefined],
    ["product_course_library_usage", "admin_report_product_library_usage", undefined],
    ["product_course_module_usage", "admin_report_product_module_usage", undefined],
  ] as const)("runs %s through %s", async (type, fn, args) => {
    const { client, rpc } = fakeRpc([]);
    const result = await generateReportCsv(client, { type, rangeDays: 30 });
    expect(result).toMatchObject({ ok: true, rowCount: 0 });
    expect(rpc).toHaveBeenCalledWith(fn, args);
  });
});
