import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { getAdminQuestionAnalytics, parseAttemptQuery } from "@/features/admin/assessments";

describe("parseAttemptQuery", () => {
  it("defaults to an empty query on page 1", () => {
    expect(parseAttemptQuery({})).toEqual({ q: "", courseId: "", status: "", page: 1 });
  });

  it("only accepts known status values", () => {
    expect(parseAttemptQuery({ status: "graded" }).status).toBe("graded");
    expect(parseAttemptQuery({ status: "in_progress" }).status).toBe("in_progress");
    expect(parseAttemptQuery({ status: "bogus" }).status).toBe("");
  });

  it("only accepts a UUID-shaped courseId", () => {
    expect(parseAttemptQuery({ courseId: "not-a-uuid" }).courseId).toBe("");
    expect(parseAttemptQuery({ courseId: "11111111-1111-1111-1111-111111111111" }).courseId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
  });

  it("clamps an invalid page number to 1", () => {
    expect(parseAttemptQuery({ page: "0" }).page).toBe(1);
    expect(parseAttemptQuery({ page: "abc" }).page).toBe(1);
    expect(parseAttemptQuery({ page: "3" }).page).toBe(3);
  });

  it("trims and caps the search query length", () => {
    expect(parseAttemptQuery({ q: "  hi  " }).q).toBe("hi");
    expect(parseAttemptQuery({ q: "x".repeat(150) }).q).toHaveLength(100);
  });
});

describe("getAdminQuestionAnalytics", () => {
  it("maps each row with its course version (C7, C39)", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          question_id: "q1",
          prompt: "2 + 2?",
          assessment_id: "a1",
          assessment_title: "Quiz",
          course_id: "c1",
          course_title: "Maths",
          version_number: 1,
          question_type: "mcq",
          points: 1,
          total_attempts: 6,
          pass_rate: 0,
          difficulty: "hard",
          quality_flag: "review_too_hard",
        },
      ],
      error: null,
    });
    const rows = await getAdminQuestionAnalytics({ rpc } as unknown as SupabaseClient, "c1");
    expect(rpc).toHaveBeenCalledWith("admin_question_analytics", { p_course_id: "c1" });
    expect(rows[0]).toMatchObject({ questionId: "q1", courseTitle: "Maths", versionNumber: 1, qualityFlag: "review_too_hard" });
  });
});
