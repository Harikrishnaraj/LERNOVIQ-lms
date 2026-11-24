import { describe, expect, it } from "vitest";
import { buildReportCsv, computeNextRunAt, reportFileName, validateReportName } from "@/features/admin/reports";

describe("computeNextRunAt", () => {
  const from = new Date("2026-01-15T10:00:00Z");

  it("returns null for 'none'", () => {
    expect(computeNextRunAt("none", from)).toBeNull();
  });

  it("adds a day for 'daily'", () => {
    expect(computeNextRunAt("daily", from)!.toISOString()).toBe("2026-01-16T10:00:00.000Z");
  });

  it("adds a week for 'weekly'", () => {
    expect(computeNextRunAt("weekly", from)!.toISOString()).toBe("2026-01-22T10:00:00.000Z");
  });

  it("adds a month for 'monthly'", () => {
    expect(computeNextRunAt("monthly", from)!.toISOString()).toBe("2026-02-15T10:00:00.000Z");
  });

  it("rolls over the year boundary for 'monthly' in December", () => {
    const dec = new Date("2026-12-20T00:00:00Z");
    expect(computeNextRunAt("monthly", dec)!.toISOString()).toBe("2027-01-20T00:00:00.000Z");
  });
});

describe("validateReportName", () => {
  it("accepts a normal name", () => {
    expect(validateReportName("Weekly summary")).toEqual({ ok: true, value: "Weekly summary" });
  });

  it("rejects an empty or non-string name", () => {
    expect(validateReportName("").ok).toBe(false);
    expect(validateReportName("   ").ok).toBe(false);
    expect(validateReportName(42).ok).toBe(false);
  });

  it("rejects a name over the limit", () => {
    expect(validateReportName("x".repeat(151)).ok).toBe(false);
  });
});

describe("buildReportCsv", () => {
  it("builds a header plus one row per point", () => {
    const csv = buildReportCsv([
      { day: "2026-01-01", enrollments: 3, completions: 1, signups: 2 },
      { day: "2026-01-02", enrollments: 0, completions: 0, signups: 0 },
    ]);
    expect(csv).toBe("day,enrollments,completions,signups\n2026-01-01,3,1,2\n2026-01-02,0,0,0");
  });

  it("returns just the header for no points", () => {
    expect(buildReportCsv([])).toBe("day,enrollments,completions,signups");
  });
});

describe("reportFileName", () => {
  const when = new Date("2026-11-24T09:54:00Z");

  it("names the export after the report and the date", () => {
    expect(reportFileName("Manual QA daily", when)).toBe("manual-qa-daily-2026-11-24.csv");
  });

  it("strips characters that are unsafe in a filename", () => {
    expect(reportFileName('  Q4 / "Idle" users: EMEA  ', when)).toBe("q4-idle-users-emea-2026-11-24.csv");
  });

  it("falls back to 'report' when nothing usable is left", () => {
    expect(reportFileName("***", when)).toBe("report-2026-11-24.csv");
  });
});
