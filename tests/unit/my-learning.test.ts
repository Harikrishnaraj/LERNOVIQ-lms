import { describe, expect, it } from "vitest";
import { progressPercent, splitLearning, type LearningItem } from "@/features/my-learning/queries";

const item = (over: Partial<LearningItem>): LearningItem => ({
  enrollmentId: "e",
  courseId: "c",
  slug: "s",
  title: "t",
  subtitle: null,
  level: "beginner",
  durationMinutes: 10,
  status: "active",
  enrolledAt: "2026-01-01",
  completedAt: null,
  totalLessons: 4,
  completedLessons: 1,
  percent: 25,
  ...over,
});

describe("progressPercent", () => {
  it("rounds and clamps", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(3, 3)).toBe(100);
    expect(progressPercent(5, 3)).toBe(100);
  });
  it("is 0 for a course with no lessons", () => {
    expect(progressPercent(0, 0)).toBe(0);
  });
});

describe("splitLearning", () => {
  it("separates in-progress from completed", () => {
    const { inProgress, completed } = splitLearning([
      item({ enrollmentId: "a" }),
      item({ enrollmentId: "b", status: "completed" }),
    ]);
    expect(inProgress.map((i) => i.enrollmentId)).toEqual(["a"]);
    expect(completed.map((i) => i.enrollmentId)).toEqual(["b"]);
  });
});
