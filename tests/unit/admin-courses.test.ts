import { describe, expect, it } from "vitest";
import {
  countByTab,
  filterAdminCourses,
  parseAdminCourseQuery,
  type AdminCourse,
} from "@/features/admin/courses";
import { BULK_ACTIONS, isReviewerAction, validateDecisionNote } from "@/features/courses/transition-rules";

const course = (over: Partial<AdminCourse>): AdminCourse => ({
  courseId: "c",
  versionId: "v",
  slug: "s",
  title: "Title",
  status: "draft",
  versionNumber: 1,
  instructorId: "i",
  instructorName: "Ada Lovelace",
  instructorEmail: "ada@example.com",
  categorySlug: "programming",
  categoryName: "Programming",
  priceCents: 0,
  currency: "USD",
  learners: 0,
  isLive: false,
  submittedAt: null,
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

const list = [
  course({ courseId: "1", title: "Python Basics", status: "submitted" }),
  course({ courseId: "2", title: "Advanced Design", status: "in_review", categorySlug: "design", categoryName: "Design", instructorName: "Grace Hopper", instructorEmail: "grace@example.com" }),
  course({ courseId: "3", title: "Live Course", status: "published", isLive: true }),
  course({ courseId: "4", title: "Sent Back", status: "changes_requested" }),
  course({ courseId: "5", title: "Turned Down", status: "rejected" }),
  course({ courseId: "6", title: "Old", status: "archived" }),
];

describe("parseAdminCourseQuery", () => {
  it("defaults, and ignores unknown values", () => {
    expect(parseAdminCourseQuery({})).toEqual({ tab: "all", q: "", category: "", view: "table" });
    expect(parseAdminCourseQuery({ tab: "hacked", view: "list", q: "  x  " })).toEqual({ tab: "all", q: "x", category: "", view: "table" });
    expect(parseAdminCourseQuery({ tab: ["pending", "draft"], view: "grid" }).tab).toBe("pending");
    expect(parseAdminCourseQuery({ q: "y".repeat(500) }).q).toHaveLength(100);
  });
});

describe("countByTab / filterAdminCourses", () => {
  it("groups statuses into tabs", () => {
    expect(countByTab(list)).toEqual({ all: 6, pending: 2, changes: 2, approved: 0, published: 1, draft: 0, archived: 1 });
  });

  it("filters by tab, category and search across title, slug and instructor", () => {
    const q = parseAdminCourseQuery({});
    expect(filterAdminCourses(list, { ...q, tab: "pending" }).map((c) => c.courseId)).toEqual(["1", "2"]);
    expect(filterAdminCourses(list, { ...q, category: "design" }).map((c) => c.courseId)).toEqual(["2"]);
    expect(filterAdminCourses(list, { ...q, q: "GRACE" }).map((c) => c.courseId)).toEqual(["2"]);
    expect(filterAdminCourses(list, { ...q, q: "python" }).map((c) => c.courseId)).toEqual(["1"]);
    expect(filterAdminCourses(list, { ...q, tab: "published", q: "python" })).toEqual([]);
  });
});

describe("decision rules", () => {
  it("requires a note to send back or reject, but not to approve", () => {
    expect(validateDecisionNote("request_changes", " ")).toMatch(/why/);
    expect(validateDecisionNote("reject", "no")).toMatch(/why/);
    expect(validateDecisionNote("request_changes", "Fix lesson 2")).toBeNull();
    expect(validateDecisionNote("approve", "")).toBeNull();
    expect(validateDecisionNote("approve", "x".repeat(4001))).toMatch(/under 4000/);
  });

  it("knows reviewer actions and which are safe in bulk", () => {
    expect(isReviewerAction("approve")).toBe(true);
    expect(isReviewerAction("submit")).toBe(false);
    expect(isReviewerAction("drop table")).toBe(false);
    expect([...BULK_ACTIONS]).toEqual(["start_review", "archive"]);
  });
});
