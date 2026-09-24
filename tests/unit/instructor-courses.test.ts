import { describe, expect, it } from "vitest";
import {
  countByFilter,
  filterCourses,
  matchesStatusFilter,
  parseStatusFilter,
  summarizeInstructor,
  type InstructorCourse,
} from "@/features/instructor/courses";

const course = (over: Partial<InstructorCourse>): InstructorCourse => ({
  courseId: "c",
  slug: "s",
  title: "Course",
  subtitle: null,
  status: "draft",
  versionNumber: 1,
  versionCount: 1,
  level: "beginner",
  priceCents: 0,
  currency: "USD",
  categoryName: null,
  updatedAt: "2026-01-01T00:00:00Z",
  isLive: false,
  learners: 0,
  completions: 0,
  ratingAvg: 0,
  ratingCount: 0,
  ...over,
});

describe("status filters", () => {
  it("parses known filters and falls back to all", () => {
    expect(parseStatusFilter("review")).toBe("review");
    expect(parseStatusFilter("nope")).toBe("all");
    expect(parseStatusFilter(undefined)).toBe("all");
  });

  it("groups the workflow states", () => {
    expect(matchesStatusFilter("draft", "draft")).toBe(true);
    expect(matchesStatusFilter("submitted", "review")).toBe(true);
    expect(matchesStatusFilter("in_review", "review")).toBe(true);
    expect(matchesStatusFilter("approved", "review")).toBe(true);
    expect(matchesStatusFilter("changes_requested", "changes")).toBe(true);
    expect(matchesStatusFilter("rejected", "changes")).toBe(true);
    expect(matchesStatusFilter("published", "published")).toBe(true);
    expect(matchesStatusFilter("archived", "archived")).toBe(true);
    expect(matchesStatusFilter("published", "draft")).toBe(false);
    expect(matchesStatusFilter("archived", "all")).toBe(true);
  });
});

describe("filterCourses / countByFilter", () => {
  const list = [
    course({ courseId: "1", title: "Intro to Python", status: "published" }),
    course({ courseId: "2", title: "Advanced SQL", subtitle: "Window functions", status: "draft" }),
    course({ courseId: "3", title: "Design basics", status: "changes_requested" }),
  ];

  it("filters by status and by title/subtitle search, case-insensitively", () => {
    expect(filterCourses(list, { status: "published" }).map((c) => c.courseId)).toEqual(["1"]);
    expect(filterCourses(list, { status: "all", q: "PYTHON" }).map((c) => c.courseId)).toEqual(["1"]);
    expect(filterCourses(list, { status: "all", q: "window" }).map((c) => c.courseId)).toEqual(["2"]);
    expect(filterCourses(list, { status: "draft", q: "python" })).toEqual([]);
    expect(filterCourses(list, { status: "all", q: "   " })).toHaveLength(3);
  });

  it("counts every filter tab", () => {
    expect(countByFilter(list)).toEqual({
      all: 3,
      draft: 1,
      review: 0,
      changes: 1,
      published: 1,
      archived: 0,
    });
  });
});

describe("summarizeInstructor", () => {
  it("adds up learners and completions, counts live courses and lists pending work", () => {
    const k = summarizeInstructor([
      course({ courseId: "a", isLive: true, status: "published", learners: 10, completions: 4, ratingAvg: 5, ratingCount: 1 }),
      course({ courseId: "b", isLive: true, status: "draft", learners: 5, completions: 1, ratingAvg: 4, ratingCount: 3 }),
      course({ courseId: "c", status: "in_review" }),
      course({ courseId: "d", status: "rejected" }),
    ]);
    expect(k).toMatchObject({ totalCourses: 4, liveCourses: 2, learners: 15, completions: 5 });
    expect(k.inReview.map((c) => c.courseId)).toEqual(["c"]);
    expect(k.needsAttention.map((c) => c.courseId)).toEqual(["d"]);
  });

  it("weights the average rating by rating count and is null when unrated", () => {
    expect(
      summarizeInstructor([
        course({ ratingAvg: 5, ratingCount: 1 }),
        course({ ratingAvg: 4, ratingCount: 3 }),
      ]).averageRating,
    ).toBe(4.3);
    expect(summarizeInstructor([course({})]).averageRating).toBeNull();
    expect(summarizeInstructor([]).averageRating).toBeNull();
  });
});
