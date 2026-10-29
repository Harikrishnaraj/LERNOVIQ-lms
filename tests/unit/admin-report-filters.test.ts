import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportCsv } from "@/features/admin/report-generation";
import { describeFilters, matchRows, parseStoredFilters, statusOptions, supportedFilters, validateFilters } from "@/features/admin/report-filters";
import { REPORT_CATALOGUE } from "@/features/admin/reports";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("validateFilters", () => {
  it("accepts supported filters and drops blanks", () => {
    expect(validateFilters("individual_user_progress", { courseId: A, userId: "", status: "completed" })).toEqual({
      ok: true,
      value: { courseId: A, status: "completed" },
    });
  });

  it("treats missing input as no filters", () => {
    expect(validateFilters("idle_users", undefined)).toEqual({ ok: true, value: {} });
  });

  it("refuses a filter the report does not support", () => {
    expect(validateFilters("daily_analytics", { courseId: A }).ok).toBe(false);
    expect(validateFilters("idle_users", { courseId: A }).ok).toBe(false);
  });

  it("refuses unknown keys, malformed ids and bad statuses", () => {
    expect(validateFilters("idle_users", { drop: "x" }).ok).toBe(false);
    expect(validateFilters("idle_users", { userId: "not-a-uuid" }).ok).toBe(false);
    expect(validateFilters("product_course_library_licence_status", { status: "completed" }).ok).toBe(false);
    expect(validateFilters("idle_users", [A]).ok).toBe(false);
    expect(validateFilters("idle_users", { userId: 5 }).ok).toBe(false);
  });

  it("falls back to no filters for unreadable stored data", () => {
    expect(parseStoredFilters("idle_users", { userId: "bad" })).toEqual({});
  });
});

describe("filter support", () => {
  it("covers every catalogue report", () => {
    for (const r of REPORT_CATALOGUE) expect(supportedFilters(r.type)).toBeDefined();
  });
  it("lists status choices only where status applies", () => {
    expect(statusOptions("product_course_library_licence_status")).toEqual(["active", "expired", "revoked"]);
    expect(statusOptions("idle_users")).toEqual([]);
  });
  it("describes set filters without printing ids", () => {
    expect(describeFilters({ courseId: A, status: "active" })).toBe("Course: selected, Status: active");
  });
});

describe("matchRows", () => {
  const rows = [{ c: A }, { c: B }];
  const get = (r: { c: string }, k: string) => (k === "courseId" ? r.c : null);
  it("keeps all rows with no filter and filters otherwise", () => {
    expect(matchRows(rows, {}, get)).toHaveLength(2);
    expect(matchRows(rows, { courseId: A }, get)).toEqual([{ c: A }]);
    expect(matchRows(rows, { courseId: undefined }, get)).toHaveLength(2);
  });
});

describe("generateReportCsv with filters", () => {
  const progress = (user_id: string, course_id: string, status: string) => ({
    user_id, full_name: null, course_id, course_title: "T", enrollment_status: status, enrolled_at: "a", completed_at: null,
    lessons_completed: 0, lessons_total: 0, assessments_passed: 0, assessments_total: 0, best_assessment_percent: null,
    certificate_status: null, last_activity_at: "a",
  });

  function client(members?: string[]) {
    const rpc = vi.fn(async () => ({ data: [progress(A, A, "active"), progress(B, B, "completed"), progress(B, A, "active")], error: null }));
    const from = vi.fn(() => ({ select: () => ({ eq: async () => ({ data: (members ?? []).map((user_id) => ({ user_id })), error: null }) }) }));
    return { rpc, from } as unknown as SupabaseClient;
  }

  it("filters by course and status", async () => {
    const r = await generateReportCsv(client(), { type: "individual_user_progress", rangeDays: 30, filters: { courseId: A, status: "active" } });
    expect(r).toMatchObject({ ok: true, rowCount: 2 });
  });

  it("filters by user", async () => {
    const r = await generateReportCsv(client(), { type: "individual_user_progress", rangeDays: 30, filters: { userId: B } });
    expect(r).toMatchObject({ ok: true, rowCount: 2 });
  });

  it("filters by organisation membership", async () => {
    const r = await generateReportCsv(client([A]), { type: "individual_user_progress", rangeDays: 30, filters: { organizationId: B } });
    expect(r).toMatchObject({ ok: true, rowCount: 1 });
  });

  it("returns an empty report when nothing matches", async () => {
    const r = await generateReportCsv(client(), { type: "individual_user_progress", rangeDays: 30, filters: { status: "cancelled" } });
    expect(r).toMatchObject({ ok: true, rowCount: 0 });
  });
});
