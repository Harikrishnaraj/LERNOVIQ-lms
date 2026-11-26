import { describe, expect, it } from "vitest";
import { parseRange, scaleBars, summarize } from "@/features/admin/analytics";

describe("parseRange", () => {
  it("accepts 7, 30 and 90 and defaults to 30", () => {
    expect(parseRange("7")).toBe(7);
    expect(parseRange(["90", "7"])).toBe(90);
    expect(parseRange("14")).toBe(30);
    expect(parseRange("abc")).toBe(30);
    expect(parseRange(undefined)).toBe(30);
  });
});

describe("summarize", () => {
  it("takes enrollments, completions and the rate from the cohort and sums sign-ups", () => {
    const t = summarize(
      [
        { day: "2026-01-01", enrollments: 4, completions: 1, signups: 2 },
        { day: "2026-01-02", enrollments: 6, completions: 2, signups: 0 },
      ],
      { enrollments: 10, completed: 3 },
    );
    expect(t).toEqual({ enrollments: 10, completions: 3, signups: 2, completionRate: 30 });
  });

  it("ignores completion events from older enrollments (C53): 1 new enrollment, 5 older completions", () => {
    const t = summarize([{ day: "d", enrollments: 1, completions: 5, signups: 0 }], { enrollments: 1, completed: 0 });
    expect(t.completions).toBe(0);
    expect(t.completionRate).toBe(0);
  });

  it("has no rate without enrollments", () => {
    expect(summarize([], { enrollments: 0, completed: 0 }).completionRate).toBeNull();
  });
});

describe("scaleBars", () => {
  it("scales to the largest value across series, keeps zeros at zero and small values visible", () => {
    const [a, b] = scaleBars([[10, 0, 5], [1, 0, 0]]);
    expect(a).toEqual([100, 0, 50]);
    expect(b).toEqual([10, 0, 0]);
    expect(scaleBars([[1, 1000]])[0]).toEqual([3, 100]);
  });

  it("handles all-zero and empty series", () => {
    expect(scaleBars([[0, 0]])).toEqual([[0, 0]]);
    expect(scaleBars([[]])).toEqual([[]]);
  });
});
