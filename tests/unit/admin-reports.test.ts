import { describe, expect, it } from "vitest";
import { buildReportCsv, computeNextRunAt, describeReportRange, reportFileName, validateReportName } from "@/features/admin/reports";

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

// Report audit C28: advance from the previous run, keep the time of day and the day of month.
describe("computeNextRunAt from the previous run", () => {
  const iso = (d: Date | null) => d!.toISOString();

  it("keeps the scheduled time of day instead of drifting to when the cron ran", () => {
    const previous = new Date("2026-03-10T09:00:00Z");
    const ranAt = new Date("2026-03-10T10:00:05Z");
    expect(iso(computeNextRunAt("daily", ranAt, previous))).toBe("2026-03-11T09:00:00.000Z");
    expect(iso(computeNextRunAt("weekly", ranAt, previous))).toBe("2026-03-17T09:00:00.000Z");
  });

  it("clamps a month-end anchor to shorter months and goes back to it after", () => {
    const now = new Date("2027-01-31T10:30:00Z");
    const feb = computeNextRunAt("monthly", now, new Date("2027-01-31T10:00:00Z"), 31);
    expect(iso(feb)).toBe("2027-02-28T10:00:00.000Z");
    const mar = computeNextRunAt("monthly", new Date("2027-02-28T10:30:00Z"), feb, 31);
    expect(iso(mar)).toBe("2027-03-31T10:00:00.000Z");
    const apr = computeNextRunAt("monthly", new Date("2027-03-31T10:30:00Z"), mar, 31);
    expect(iso(apr)).toBe("2027-04-30T10:00:00.000Z");
  });

  it("uses 29 February in a leap year", () => {
    const next = computeNextRunAt("monthly", new Date("2028-01-31T11:00:00Z"), new Date("2028-01-31T10:00:00Z"), 31);
    expect(iso(next)).toBe("2028-02-29T10:00:00.000Z");
  });

  it("never skips a month for a report created on the 31st", () => {
    expect(iso(computeNextRunAt("monthly", new Date("2026-01-31T08:00:00Z")))).toBe("2026-02-28T08:00:00.000Z");
  });

  it("catches up after downtime with one run, on the schedule's own grid", () => {
    const previous = new Date("2026-03-01T09:00:00Z");
    const now = new Date("2026-03-05T12:00:00Z");
    expect(iso(computeNextRunAt("daily", now, previous))).toBe("2026-03-06T09:00:00.000Z");
    expect(iso(computeNextRunAt("weekly", now, previous))).toBe("2026-03-08T09:00:00.000Z");
    const monthly = computeNextRunAt("monthly", new Date("2026-06-15T00:00:00Z"), new Date("2026-01-31T09:00:00Z"), 31);
    expect(iso(monthly)).toBe("2026-06-30T09:00:00.000Z");
  });

  it("moves to the next period when the previous run is exactly now", () => {
    const at = new Date("2026-03-10T09:00:00Z");
    expect(iso(computeNextRunAt("daily", at, at))).toBe("2026-03-11T09:00:00.000Z");
  });
});

describe("describeReportRange", () => {
  it("describes a look-back window, an idle threshold and a snapshot (report audit C12, C50)", () => {
    expect(describeReportRange("daily_analytics", 7)).toBe("Last 7 days");
    expect(describeReportRange("idle_users", 30)).toBe("Idle for 30+ days");
    expect(describeReportRange("product_course_library_licence_status", 30)).toBe("Current snapshot");
    expect(describeReportRange("product_course_library_usage", 90)).toBe("Current snapshot");
    expect(describeReportRange("product_course_module_usage", 7)).toBe("Current snapshot");
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
