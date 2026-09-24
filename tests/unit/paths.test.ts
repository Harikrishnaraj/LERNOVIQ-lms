import { describe, expect, it } from "vitest";
import { pathProgress, type PathCourse } from "@/features/paths/paths";

const course = (position: number, status: PathCourse["status"]): PathCourse => ({
  courseId: `c${position}`,
  slug: `c-${position}`,
  title: `Course ${position}`,
  level: "beginner",
  durationMinutes: 60,
  priceCents: 0,
  currency: "USD",
  position,
  status,
});

describe("pathProgress", () => {
  it("counts completed courses and points at the first unfinished one in path order", () => {
    const p = pathProgress([course(2, "not_started"), course(0, "completed"), course(1, "active")]);
    expect(p).toMatchObject({ completed: 1, total: 3, percent: 33 });
    expect(p.next?.slug).toBe("c-1");
  });

  it("does not skip an unfinished early course even when a later one is completed", () => {
    expect(pathProgress([course(0, "not_started"), course(1, "completed")]).next?.slug).toBe("c-0");
  });

  it("is 100% with no next course when everything is completed", () => {
    const p = pathProgress([course(0, "completed"), course(1, "completed")]);
    expect(p).toMatchObject({ completed: 2, total: 2, percent: 100, next: null });
  });

  it("handles an empty path", () => {
    expect(pathProgress([])).toEqual({ completed: 0, total: 0, percent: 0, next: null });
  });
});
