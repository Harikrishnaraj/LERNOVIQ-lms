import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportCsv } from "@/features/admin/report-generation";
import { DEFAULT_REPORT_TYPE, REPORT_CATALOGUE, REPORT_CATEGORIES, getReportDefinition, validateReportType } from "@/features/admin/reports";

describe("report catalogue", () => {
  it("lists every report once, with a known category", () => {
    const types = REPORT_CATALOGUE.map((r) => r.type);
    expect(new Set(types).size).toBe(types.length);
    const categories = REPORT_CATEGORIES.map((c) => c.id);
    for (const r of REPORT_CATALOGUE) expect(categories).toContain(r.category);
  });

  it("covers the three design-doc categories with at least one report each", () => {
    for (const category of REPORT_CATEGORIES) {
      expect(REPORT_CATALOGUE.some((r) => r.category === category.id)).toBe(true);
    }
  });

  it("enables all nine reports now that each has real data behind it", () => {
    expect(REPORT_CATALOGUE).toHaveLength(9);
    expect(REPORT_CATALOGUE.filter((r) => !r.available)).toEqual([]);
  });

  it("defaults new reports to the available daily analytics type", () => {
    expect(getReportDefinition(DEFAULT_REPORT_TYPE)?.available).toBe(true);
  });
});

describe("validateReportType", () => {
  it("accepts a registered type", () => {
    expect(validateReportType("idle_users")).toEqual({ ok: true, value: "idle_users" });
  });

  it("rejects an unknown type, a non-string and an empty value", () => {
    expect(validateReportType("drop_table").ok).toBe(false);
    expect(validateReportType(42).ok).toBe(false);
    expect(validateReportType("").ok).toBe(false);
  });
});

describe("generateReportCsv", () => {
  it("refuses a report that is not in the catalogue without touching the database", async () => {
    const from = vi.fn(() => {
      throw new Error("database must not be queried for an unknown report");
    });
    const client = { from } as unknown as SupabaseClient;

    const result = await generateReportCsv(client, { type: "made_up" as never, rangeDays: 30 });

    expect(result).toEqual({ ok: false, error: "This report is not available yet." });
    expect(from).not.toHaveBeenCalled();
  });

  it("refuses a type that is not in the catalogue", async () => {
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    const result = await generateReportCsv(client, { type: "not_a_report" as never, rangeDays: 7 });
    expect(result.ok).toBe(false);
  });
});
