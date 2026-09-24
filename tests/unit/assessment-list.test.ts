import { describe, expect, it } from "vitest";
import { classifyAssessment, isUpcoming } from "@/features/assessments/list";

const graded = (passed: boolean | null) => ({ status: "graded" as const, passed });

describe("classifyAssessment", () => {
  it("is not_started without attempts", () => {
    expect(classifyAssessment(2, [])).toBe("not_started");
  });

  it("is in_progress whenever an attempt is open, even if others failed", () => {
    expect(classifyAssessment(2, [graded(false), { status: "in_progress", passed: null }])).toBe("in_progress");
  });

  it("is passed once any attempt passed", () => {
    expect(classifyAssessment(3, [graded(false), graded(true)])).toBe("passed");
  });

  it("is pending_review while a manual-review attempt is waiting", () => {
    expect(classifyAssessment(3, [{ status: "submitted", passed: null }])).toBe("pending_review");
  });

  it("allows a retry while attempts remain and is final once they run out", () => {
    expect(classifyAssessment(2, [graded(false)])).toBe("failed_retry");
    expect(classifyAssessment(2, [graded(false), graded(false)])).toBe("failed_final");
  });

  it("never runs out with unlimited attempts", () => {
    expect(classifyAssessment(null, Array.from({ length: 30 }, () => graded(false)))).toBe("failed_retry");
  });
});

describe("isUpcoming", () => {
  it("separates actionable from finished states", () => {
    for (const s of ["not_started", "in_progress", "failed_retry"] as const) expect(isUpcoming(s)).toBe(true);
    for (const s of ["passed", "pending_review", "failed_final"] as const) expect(isUpcoming(s)).toBe(false);
  });
});
