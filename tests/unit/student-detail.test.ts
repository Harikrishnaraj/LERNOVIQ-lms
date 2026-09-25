import { describe, expect, it } from "vitest";
import { MESSAGE_MAX, lessonState, validateStudentMessage } from "@/features/instructor/student-detail";

describe("student detail rules (F-213)", () => {
  it("derives lesson state", () => {
    expect(lessonState("2026-01-01", 0, "2026-01-01")).toBe("completed");
    expect(lessonState(null, 30, null)).toBe("in_progress");
    expect(lessonState(null, 0, "2026-01-01")).toBe("in_progress");
    expect(lessonState(null, 0, null)).toBe("not_started");
  });

  it("validates messages", () => {
    expect(validateStudentMessage("  hi  ")).toEqual({ ok: true, text: "hi" });
    expect(validateStudentMessage("   ").ok).toBe(false);
    expect(validateStudentMessage(42).ok).toBe(false);
    expect(validateStudentMessage("x".repeat(MESSAGE_MAX + 1)).ok).toBe(false);
    expect(validateStudentMessage("x".repeat(MESSAGE_MAX)).ok).toBe(true);
  });
});
