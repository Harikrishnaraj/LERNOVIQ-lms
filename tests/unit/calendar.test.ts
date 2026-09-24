import { describe, expect, it } from "vitest";
import {
  daysBetween,
  groupByDay,
  isValidYmd,
  monthGrid,
  parseCalendarQuery,
  periodLabel,
  shiftDate,
  startOfWeek,
  visibleRange,
  type CalendarEvent,
} from "@/features/calendar/calendar";

const q = (view: "month" | "week" | "agenda", date: string) => ({ view, date });

describe("parseCalendarQuery / isValidYmd", () => {
  it("defaults to the month view on today, and rejects junk and impossible dates", () => {
    const today = new Date("2026-05-10T15:00:00Z");
    expect(parseCalendarQuery({}, today)).toEqual({ view: "month", date: "2026-05-10" });
    expect(parseCalendarQuery({ view: "year", date: "yesterday" }, today)).toEqual({ view: "month", date: "2026-05-10" });
    expect(parseCalendarQuery({ view: "week", date: "2026-02-30" }, today)).toEqual({ view: "week", date: "2026-05-10" });
    expect(parseCalendarQuery({ view: ["agenda"], date: ["2026-01-02"] }, today)).toEqual({ view: "agenda", date: "2026-01-02" });
    expect(isValidYmd("2024-02-29")).toBe(true);
    expect(isValidYmd("2026-02-29")).toBe(false);
  });
});

describe("startOfWeek", () => {
  it("returns the Monday, including across month and year boundaries", () => {
    expect(startOfWeek("2026-03-18")).toBe("2026-03-16"); // Wednesday
    expect(startOfWeek("2026-03-16")).toBe("2026-03-16"); // Monday itself
    expect(startOfWeek("2026-03-22")).toBe("2026-03-16"); // Sunday belongs to the week before
    expect(startOfWeek("2026-01-01")).toBe("2025-12-29");
  });
});

describe("visibleRange", () => {
  it("week: Monday to next Monday (exclusive)", () => {
    expect(visibleRange(q("week", "2026-03-18"))).toEqual({ from: "2026-03-16", to: "2026-03-23" });
  });

  it("agenda: 30 days from the anchor", () => {
    expect(visibleRange(q("agenda", "2026-03-18"))).toEqual({ from: "2026-03-18", to: "2026-04-17" });
  });

  it("month: whole weeks covering the month", () => {
    // Feb 2026 starts on a Sunday and ends on a Saturday -> 5 weeks from Mon Jan 26 to Mon Mar 2.
    expect(visibleRange(q("month", "2026-02-10"))).toEqual({ from: "2026-01-26", to: "2026-03-02" });
    // March 2026: Sunday 1st .. Tuesday 31st.
    expect(visibleRange(q("month", "2026-03-31"))).toEqual({ from: "2026-02-23", to: "2026-04-06" });
    // December rolls the year for the end boundary.
    expect(visibleRange(q("month", "2025-12-15"))).toEqual({ from: "2025-12-01", to: "2026-01-05" });
  });
});

describe("monthGrid", () => {
  it("has complete Monday-first weeks and flags days outside the month", () => {
    const weeks = monthGrid(q("month", "2026-02-10"));
    expect(weeks).toHaveLength(5);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0]).toEqual({ date: "2026-01-26", inMonth: false });
    expect(weeks[0][6]).toEqual({ date: "2026-02-01", inMonth: true });
    expect(weeks[4][6]).toEqual({ date: "2026-03-01", inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(28);
  });

  it("handles a six-week month and leap years", () => {
    expect(monthGrid(q("month", "2026-03-15"))).toHaveLength(6);
    expect(monthGrid(q("month", "2024-02-15")).flat().filter((d) => d.inMonth)).toHaveLength(29);
  });
});

describe("shiftDate", () => {
  it("moves by month, week or 30 days and handles year boundaries", () => {
    expect(shiftDate(q("month", "2026-01-31"), -1)).toBe("2025-12-01");
    expect(shiftDate(q("month", "2026-12-05"), 1)).toBe("2027-01-01");
    expect(shiftDate(q("week", "2026-03-18"), 1)).toBe("2026-03-25");
    expect(shiftDate(q("week", "2026-03-02"), -1)).toBe("2026-02-23");
    expect(shiftDate(q("agenda", "2026-03-18"), 1)).toBe("2026-04-17");
  });
});

describe("periodLabel / daysBetween", () => {
  it("labels the period", () => {
    expect(periodLabel(q("month", "2026-03-18"))).toBe("March 2026");
    expect(periodLabel(q("week", "2026-03-18"))).toBe("Mar 16 to Mar 22, 2026");
  });

  it("lists days half-open", () => {
    expect(daysBetween("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(daysBetween("2026-03-01", "2026-03-01")).toEqual([]);
  });
});

describe("groupByDay", () => {
  const ev = (id: string, at: string, title: string): CalendarEvent => ({ id, at, kind: "assignment_due", title, courseTitle: "C", href: "/x" });

  it("groups by UTC day and sorts by time then title", () => {
    const map = groupByDay([
      ev("3", "2026-03-18T23:59:00Z", "Late"),
      ev("1", "2026-03-18T09:00:00Z", "B"),
      ev("2", "2026-03-18T09:00:00Z", "A"),
      ev("4", "2026-03-19T00:00:00Z", "Next day"),
    ]);
    expect([...map.keys()]).toEqual(["2026-03-18", "2026-03-19"]);
    expect(map.get("2026-03-18")!.map((e) => e.id)).toEqual(["2", "1", "3"]);
  });
});
