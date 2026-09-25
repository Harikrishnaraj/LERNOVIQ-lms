import { describe, expect, it } from "vitest";
import { computeStreaks, deriveSkills, formatHours, recentActivity, skillLevel, type CourseProgress } from "@/features/progress/progress";

const today = new Date("2026-06-15T10:00:00Z");

describe("computeStreaks", () => {
  it("is zero with no activity", () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, longest: 0 });
  });

  it("counts consecutive days back from today", () => {
    expect(computeStreaks(["2026-06-15", "2026-06-14", "2026-06-13"], today)).toEqual({ current: 3, longest: 3 });
  });

  it("keeps a streak alive when the last activity was yesterday", () => {
    expect(computeStreaks(["2026-06-14", "2026-06-13"], today)).toEqual({ current: 2, longest: 2 });
  });

  it("breaks the current streak after a missed day but remembers the longest", () => {
    const days = ["2026-06-12", "2026-06-11", "2026-06-10", "2026-06-09", "2026-06-01"];
    expect(computeStreaks(days, today)).toEqual({ current: 0, longest: 4 });
  });

  it("stops the current streak at a gap and ignores duplicates and order", () => {
    const days = ["2026-06-13", "2026-06-15", "2026-06-15", "2026-06-14", "2026-06-10", "2026-06-11"];
    expect(computeStreaks(days, today)).toEqual({ current: 3, longest: 3 });
  });

  it("handles month and year boundaries", () => {
    expect(computeStreaks(["2026-01-01", "2025-12-31", "2025-12-30"], new Date("2026-01-01T00:30:00Z"))).toEqual({ current: 3, longest: 3 });
  });
});

const course = (over: Partial<CourseProgress>): CourseProgress => ({
  courseId: "c", slug: "s", title: "T", category: "Programming", status: "active",
  totalLessons: 10, completedLessons: 0, minutes: 0, percent: 0, ...over,
});

describe("skills", () => {
  it("maps completed courses to levels", () => {
    expect(skillLevel(0)).toBe("Beginner");
    expect(skillLevel(1)).toBe("Intermediate");
    expect(skillLevel(2)).toBe("Intermediate");
    expect(skillLevel(3)).toBe("Advanced");
  });

  it("groups by category, ignores untouched or uncategorised courses, and ranks strongest first", () => {
    const skills = deriveSkills([
      course({ category: "Programming", completedLessons: 10, minutes: 120, status: "completed" }),
      course({ category: "Programming", completedLessons: 3, minutes: 30 }),
      course({ category: "Design", completedLessons: 5, minutes: 300 }),
      course({ category: "Design", completedLessons: 0 }),
      course({ category: null, completedLessons: 4, minutes: 40 }),
    ]);
    expect(skills).toEqual([
      { name: "Programming", level: "Intermediate", completedCourses: 1, completedLessons: 13, minutes: 150 },
      { name: "Design", level: "Beginner", completedCourses: 0, completedLessons: 5, minutes: 300 },
    ]);
    expect(deriveSkills([])).toEqual([]);
  });
});

describe("formatHours / recentActivity", () => {
  it("formats minutes and hours", () => {
    expect(formatHours(0)).toBe("0 min");
    expect(formatHours(45)).toBe("45 min");
    expect(formatHours(60)).toBe("1 h");
    expect(formatHours(90)).toBe("1.5 h");
    expect(formatHours(600)).toBe("10 h");
  });

  it("builds an oldest-first strip ending today", () => {
    const strip = recentActivity(["2026-06-15", "2026-06-13"], 4, today);
    expect(strip).toEqual([
      { day: "2026-06-12", active: false },
      { day: "2026-06-13", active: true },
      { day: "2026-06-14", active: false },
      { day: "2026-06-15", active: true },
    ]);
  });
});
