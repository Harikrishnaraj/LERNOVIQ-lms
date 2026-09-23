import { describe, expect, it } from "vitest";
import {
  COURSE_STATUSES,
  IllegalCourseTransitionError,
  allowedCourseActions,
  assertCourseTransition,
  isCourseStatus,
  nextCourseStatus,
} from "@/features/courses/course-status";

describe("course status state machine (ADR-010)", () => {
  it("follows the happy path draft → published → archived", () => {
    let s = assertCourseTransition("draft", "submit");
    s = assertCourseTransition(s, "start_review");
    s = assertCourseTransition(s, "approve");
    s = assertCourseTransition(s, "publish");
    expect(s).toBe("published");
    expect(assertCourseTransition(s, "archive")).toBe("archived");
  });

  it("supports the changes-requested loop", () => {
    expect(nextCourseStatus("in_review", "request_changes")).toBe("changes_requested");
    expect(nextCourseStatus("changes_requested", "submit")).toBe("submitted");
  });

  it("lets a rejected course be reopened as a draft", () => {
    expect(nextCourseStatus("in_review", "reject")).toBe("rejected");
    expect(nextCourseStatus("rejected", "reopen")).toBe("draft");
  });

  it.each([
    ["draft", "publish"],
    ["draft", "approve"],
    ["submitted", "publish"],
    ["in_review", "publish"],
    ["changes_requested", "approve"],
    ["published", "submit"],
    ["archived", "publish"],
  ] as const)("rejects %s → %s", (from, action) => {
    expect(nextCourseStatus(from, action)).toBeNull();
    expect(() => assertCourseTransition(from, action)).toThrow(IllegalCourseTransitionError);
  });

  it("never publishes without approval", () => {
    for (const s of COURSE_STATUSES) {
      if (s !== "approved") expect(nextCourseStatus(s, "publish")).toBeNull();
    }
  });

  it("archived is terminal", () => {
    expect(allowedCourseActions("archived")).toEqual([]);
  });

  it("guards unknown values", () => {
    expect(isCourseStatus("published")).toBe(true);
    expect(isCourseStatus("live")).toBe(false);
    expect(isCourseStatus(3)).toBe(false);
  });
});
