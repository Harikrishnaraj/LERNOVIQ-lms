import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  parseAnalyticsRange,
  parseCourseFilter,
  scaleBars,
  summarizeInstructorAnalytics,
  type InstructorCourseBreakdown,
  type InstructorDailyPoint,
} from "@/features/instructor/analytics";

describe("instructor analytics feature", () => {
  describe("parseAnalyticsRange", () => {
    it("parses valid ranges", () => {
      expect(parseAnalyticsRange("7")).toBe(7);
      expect(parseAnalyticsRange("30")).toBe(30);
      expect(parseAnalyticsRange("90")).toBe(90);
      expect(parseAnalyticsRange("365")).toBe(365);
    });

    it("defaults to 30 for missing or invalid ranges", () => {
      expect(parseAnalyticsRange(undefined)).toBe(30);
      expect(parseAnalyticsRange("")).toBe(30);
      expect(parseAnalyticsRange("invalid")).toBe(30);
      expect(parseAnalyticsRange("15")).toBe(30);
    });

    it("handles array parameter", () => {
      expect(parseAnalyticsRange(["90", "30"])).toBe(90);
    });
  });

  describe("parseCourseFilter", () => {
    it("returns null for all or empty", () => {
      expect(parseCourseFilter(undefined)).toBeNull();
      expect(parseCourseFilter("")).toBeNull();
      expect(parseCourseFilter("all")).toBeNull();
      expect(parseCourseFilter("   ")).toBeNull();
    });

    it("returns valid uuid string", () => {
      const id = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
      expect(parseCourseFilter(id)).toBe(id);
    });

    it("returns null for non-uuid strings", () => {
      expect(parseCourseFilter("not-a-uuid")).toBeNull();
      expect(parseCourseFilter("12345")).toBeNull();
    });
  });

  describe("formatCurrency", () => {
    it("formats 0 cents without decimals", () => {
      expect(formatCurrency(0)).toBe("$0");
    });

    it("formats whole dollars without decimals", () => {
      expect(formatCurrency(5000)).toBe("$50");
    });

    it("formats fractional dollars with 2 decimals", () => {
      expect(formatCurrency(4999)).toBe("$49.99");
    });
  });

  describe("summarizeInstructorAnalytics", () => {
    it("returns correct totals with 0 enrollments", () => {
      const points: InstructorDailyPoint[] = [
        { day: "2026-09-20", enrollments: 0, completions: 0, activeLearners: 0, revenueCents: 0 },
        { day: "2026-09-21", enrollments: 0, completions: 0, activeLearners: 0, revenueCents: 0 },
      ];
      const breakdown: InstructorCourseBreakdown[] = [];
      const summary = summarizeInstructorAnalytics(points, breakdown);

      expect(summary.totalEnrollments).toBe(0);
      expect(summary.totalCompletions).toBe(0);
      expect(summary.completionRate).toBeNull();
      expect(summary.activeLearners).toBe(0);
      expect(summary.totalRevenueCents).toBe(0);
      expect(summary.avgRevenuePerLearnerCents).toBe(0);
    });

    it("calculates totals, completion rate, revenue and active learners accurately", () => {
      const points: InstructorDailyPoint[] = [
        { day: "2026-09-20", enrollments: 3, completions: 1, activeLearners: 4, revenueCents: 6000 },
        { day: "2026-09-21", enrollments: 2, completions: 2, activeLearners: 5, revenueCents: 4000 },
      ];
      const breakdown: InstructorCourseBreakdown[] = [
        {
          courseId: "course-1",
          title: "Course 1",
          slug: "course-1",
          enrollments: 3,
          completions: 2,
          completionRate: 67,
          activeLearners: 4,
          revenueCents: 6000,
        },
        {
          courseId: "course-2",
          title: "Course 2",
          slug: "course-2",
          enrollments: 2,
          completions: 1,
          completionRate: 50,
          activeLearners: 3,
          revenueCents: 4000,
        },
      ];
      const summary = summarizeInstructorAnalytics(points, breakdown);

      expect(summary.totalEnrollments).toBe(5);
      expect(summary.totalCompletions).toBe(3);
      expect(summary.completionRate).toBe(60); // 3/5 = 60%
      expect(summary.totalRevenueCents).toBe(10000);
      expect(summary.avgRevenuePerLearnerCents).toBe(2000);
      expect(summary.activeLearners).toBeGreaterThanOrEqual(5);
    });
  });

  describe("scaleBars", () => {
    it("scales bars proportional to maximum", () => {
      const series = [
        [10, 5, 0],
        [20, 10, 0],
      ];
      const scaled = scaleBars(series);
      expect(scaled[1][0]).toBe(100); // 20 / 20 = 100%
      expect(scaled[0][0]).toBe(50); // 10 / 20 = 50%
      expect(scaled[0][2]).toBe(0); // 0 stays 0
    });
  });
});
