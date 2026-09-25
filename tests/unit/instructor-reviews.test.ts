import { describe, expect, it } from "vitest";
import {
  calculateReviewSummary,
  filterAndSortReviews,
  parseRatingFilter,
  parseSortOption,
  parseStatusFilter,
  type InstructorReview,
} from "@/features/instructor/reviews";

const mockReviews: InstructorReview[] = [
  {
    id: "r-1",
    courseId: "c-1",
    courseTitle: "TypeScript Mastery",
    courseSlug: "typescript-mastery",
    userId: "u-1",
    learnerName: "Alice Smith",
    rating: 5,
    body: "Fantastic course, learned so much about type guards!",
    hidden: false,
    instructorReply: "Thanks Alice! Glad you enjoyed the type guards section.",
    repliedAt: "2026-09-20T10:00:00Z",
    createdAt: "2026-09-18T10:00:00Z",
    updatedAt: "2026-09-20T10:00:00Z",
  },
  {
    id: "r-2",
    courseId: "c-1",
    courseTitle: "TypeScript Mastery",
    courseSlug: "typescript-mastery",
    userId: "u-2",
    learnerName: "Bob Jones",
    rating: 4,
    body: "Great content, but could use more coding exercises.",
    hidden: false,
    instructorReply: null,
    repliedAt: null,
    createdAt: "2026-09-19T14:30:00Z",
    updatedAt: "2026-09-19T14:30:00Z",
  },
  {
    id: "r-3",
    courseId: "c-2",
    courseTitle: "React Architecture",
    courseSlug: "react-architecture",
    userId: "u-3",
    learnerName: "Charlie Brown",
    rating: 2,
    body: "Too fast-paced for beginners.",
    hidden: false,
    instructorReply: null,
    repliedAt: null,
    createdAt: "2026-09-15T09:00:00Z",
    updatedAt: "2026-09-15T09:00:00Z",
  },
  {
    id: "r-4",
    courseId: "c-2",
    courseTitle: "React Architecture",
    courseSlug: "react-architecture",
    userId: "u-4",
    learnerName: "Diana Prince",
    rating: 5,
    body: "The section on custom hooks is absolute gold.",
    hidden: false,
    instructorReply: "Thank you Diana!",
    repliedAt: "2026-09-21T08:00:00Z",
    createdAt: "2026-09-21T07:00:00Z",
    updatedAt: "2026-09-21T08:00:00Z",
  },
];

describe("instructor-reviews unit tests", () => {
  describe("parameter parsers", () => {
    it("parses rating filter correctly", () => {
      expect(parseRatingFilter("5")).toBe(5);
      expect(parseRatingFilter("4")).toBe(4);
      expect(parseRatingFilter("1")).toBe(1);
      expect(parseRatingFilter("all")).toBe("all");
      expect(parseRatingFilter("invalid")).toBe("all");
      expect(parseRatingFilter(null)).toBe("all");
    });

    it("parses status filter correctly", () => {
      expect(parseStatusFilter("unreplied")).toBe("unreplied");
      expect(parseStatusFilter("replied")).toBe("replied");
      expect(parseStatusFilter("all")).toBe("all");
      expect(parseStatusFilter("foo")).toBe("all");
      expect(parseStatusFilter(null)).toBe("all");
    });

    it("parses sort option correctly", () => {
      expect(parseSortOption("oldest")).toBe("oldest");
      expect(parseSortOption("highest")).toBe("highest");
      expect(parseSortOption("lowest")).toBe("lowest");
      expect(parseSortOption("newest")).toBe("newest");
      expect(parseSortOption("random")).toBe("newest");
    });
  });

  describe("calculateReviewSummary", () => {
    it("handles empty review list", () => {
      const summary = calculateReviewSummary([]);
      expect(summary.totalReviews).toBe(0);
      expect(summary.averageRating).toBe(0);
      expect(summary.repliedCount).toBe(0);
      expect(summary.unrepliedCount).toBe(0);
      expect(summary.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
      expect(summary.percentages).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });

    it("calculates accurate summary, counts, and distribution percentages", () => {
      const summary = calculateReviewSummary(mockReviews);
      expect(summary.totalReviews).toBe(4);
      // (5 + 4 + 2 + 5) / 4 = 16 / 4 = 4.0
      expect(summary.averageRating).toBe(4.0);
      expect(summary.repliedCount).toBe(2);
      expect(summary.unrepliedCount).toBe(2);
      expect(summary.distribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 });
      // 5: 2/4 = 50%, 4: 1/4 = 25%, 2: 1/4 = 25%
      expect(summary.percentages[5]).toBe(50);
      expect(summary.percentages[4]).toBe(25);
      expect(summary.percentages[2]).toBe(25);
      expect(summary.percentages[1]).toBe(0);
      expect(summary.percentages[3]).toBe(0);
    });
  });

  describe("filterAndSortReviews", () => {
    it("filters by rating", () => {
      const fiveStars = filterAndSortReviews(mockReviews, { rating: 5 });
      expect(fiveStars.length).toBe(2);
      expect(fiveStars.every((r) => r.rating === 5)).toBe(true);

      const twoStars = filterAndSortReviews(mockReviews, { rating: 2 });
      expect(twoStars.length).toBe(1);
      expect(twoStars[0].learnerName).toBe("Charlie Brown");
    });

    it("filters by reply status", () => {
      const unreplied = filterAndSortReviews(mockReviews, { status: "unreplied" });
      expect(unreplied.length).toBe(2);
      expect(unreplied.map((r) => r.learnerName)).toEqual(
        expect.arrayContaining(["Bob Jones", "Charlie Brown"]),
      );

      const replied = filterAndSortReviews(mockReviews, { status: "replied" });
      expect(replied.length).toBe(2);
      expect(replied.map((r) => r.learnerName)).toEqual(
        expect.arrayContaining(["Alice Smith", "Diana Prince"]),
      );
    });

    it("filters by search term across learner name, body, course title, and reply", () => {
      // By learner name
      const byName = filterAndSortReviews(mockReviews, { search: "Alice" });
      expect(byName.length).toBe(1);
      expect(byName[0].id).toBe("r-1");

      // By review text
      const byBody = filterAndSortReviews(mockReviews, { search: "custom hooks" });
      expect(byBody.length).toBe(1);
      expect(byBody[0].id).toBe("r-4");

      // By course title
      const byCourse = filterAndSortReviews(mockReviews, { search: "React Architecture" });
      expect(byCourse.length).toBe(2);

      // By instructor reply text
      const byReply = filterAndSortReviews(mockReviews, { search: "type guards section" });
      expect(byReply.length).toBe(1);
      expect(byReply[0].id).toBe("r-1");
    });

    it("sorts by newest first (default)", () => {
      const sorted = filterAndSortReviews(mockReviews, { sort: "newest" });
      expect(sorted[0].id).toBe("r-4"); // 2026-09-21
      expect(sorted[sorted.length - 1].id).toBe("r-3"); // 2026-09-15
    });

    it("sorts by oldest first", () => {
      const sorted = filterAndSortReviews(mockReviews, { sort: "oldest" });
      expect(sorted[0].id).toBe("r-3"); // 2026-09-15
      expect(sorted[sorted.length - 1].id).toBe("r-4"); // 2026-09-21
    });

    it("sorts by highest rating first", () => {
      const sorted = filterAndSortReviews(mockReviews, { sort: "highest" });
      expect(sorted[0].rating).toBe(5);
      expect(sorted[1].rating).toBe(5);
      expect(sorted[2].rating).toBe(4);
      expect(sorted[3].rating).toBe(2);
    });

    it("sorts by lowest rating first", () => {
      const sorted = filterAndSortReviews(mockReviews, { sort: "lowest" });
      expect(sorted[0].rating).toBe(2);
      expect(sorted[1].rating).toBe(4);
      expect(sorted[2].rating).toBe(5);
      expect(sorted[3].rating).toBe(5);
    });
  });
});
