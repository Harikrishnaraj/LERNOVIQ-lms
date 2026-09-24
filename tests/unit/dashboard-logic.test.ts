import { describe, expect, it } from "vitest";
import {
  greetingName,
  interestSlugs,
  pickRecommendations,
  startOfUtcDay,
  upcomingAssessments,
} from "@/features/dashboard/logic";

describe("greetingName", () => {
  it("uses the first name", () => expect(greetingName("Grace Brewster Hopper", "g@x.com")).toBe("Grace"));
  it("falls back to the email local part", () => expect(greetingName(null, "ada@example.com")).toBe("ada"));
  it("falls back to a neutral word", () => {
    expect(greetingName("  ", null)).toBe("there");
    expect(greetingName(undefined, undefined)).toBe("there");
  });
});

describe("interestSlugs", () => {
  it("keeps only known interest slugs", () => {
    expect(interestSlugs(["design", "nope", 5, "business"])).toEqual(["design", "business"]);
  });
  it("tolerates junk", () => {
    expect(interestSlugs(null)).toEqual([]);
    expect(interestSlugs("design")).toEqual([]);
  });
});

describe("pickRecommendations", () => {
  const c = (id: string) => ({ id });
  it("interleaves lists so every interest is represented", () => {
    const out = pickRecommendations([[c("a1"), c("a2")], [c("b1"), c("b2")]], new Set(), 3);
    expect(out.map((x) => x.id)).toEqual(["a1", "b1", "a2"]);
  });
  it("skips owned and duplicate courses", () => {
    const out = pickRecommendations([[c("a"), c("b")], [c("b"), c("c")]], new Set(["a"]), 5);
    expect(out.map((x) => x.id)).toEqual(["b", "c"]);
  });
  it("returns fewer than the limit when candidates run out", () => {
    expect(pickRecommendations([[c("a")]], new Set(), 3)).toHaveLength(1);
    expect(pickRecommendations([], new Set(), 3)).toEqual([]);
  });
});

describe("upcomingAssessments", () => {
  const a = (id: string, maxAttempts: number | null = 2) => ({ id, maxAttempts });
  it("hides passed, pending-review and exhausted assessments", () => {
    const out = upcomingAssessments(
      [a("passed"), a("pending"), a("exhausted"), a("fresh"), a("retry")],
      [
        { assessmentId: "passed", status: "graded", passed: true },
        { assessmentId: "pending", status: "submitted", passed: null },
        { assessmentId: "exhausted", status: "graded", passed: false },
        { assessmentId: "exhausted", status: "graded", passed: false },
        { assessmentId: "retry", status: "graded", passed: false },
      ],
    );
    expect(out.map((x) => x.id)).toEqual(["fresh", "retry"]);
  });
  it("lists in-progress attempts first, even when attempts are used up", () => {
    const out = upcomingAssessments(
      [a("later"), a("now", 1)],
      [{ assessmentId: "now", status: "in_progress", passed: null }],
    );
    expect(out.map((x) => [x.id, x.inProgress])).toEqual([
      ["now", true],
      ["later", false],
    ]);
  });
  it("treats null max attempts as unlimited", () => {
    const many = Array.from({ length: 9 }, () => ({ assessmentId: "u", status: "graded" as const, passed: false }));
    expect(upcomingAssessments([a("u", null)], many)).toHaveLength(1);
  });
});

describe("startOfUtcDay", () => {
  it("truncates to midnight UTC", () => {
    expect(startOfUtcDay(new Date("2026-05-07T15:42:10Z"))).toBe("2026-05-07T00:00:00.000Z");
  });
});
