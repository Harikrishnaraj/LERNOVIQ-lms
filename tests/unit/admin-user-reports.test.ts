import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReportCsv } from "@/features/admin/report-generation";
import { buildCsv } from "@/features/admin/reports";
import {
  buildIdleUsersCsv,
  buildUserProgressCsv,
  getIdleUsers,
  getUserProgress,
  percentComplete,
  type UserProgressRow,
} from "@/features/admin/user-reports";

const progressRow: UserProgressRow = {
  userId: "u1",
  fullName: "Ada, Lovelace",
  courseId: "c1",
  courseTitle: "AML & KYC",
  enrollmentStatus: "active",
  enrolledAt: "2026-10-01T00:00:00Z",
  completedAt: null,
  lessonsCompleted: 1,
  lessonsTotal: 3,
  assessmentsPassed: 0,
  assessmentsTotal: 1,
  bestAssessmentPercent: 62.5,
  certificateStatus: null,
  lastActivityAt: "2026-10-20T00:00:00Z",
};

describe("percentComplete", () => {
  it("rounds, caps at 100 and is null with no lessons", () => {
    expect(percentComplete(1, 3)).toBe(33);
    expect(percentComplete(5, 3)).toBe(100);
    expect(percentComplete(0, 0)).toBeNull();
  });
});

describe("buildCsv", () => {
  it("escapes commas and quotes and writes null as an empty cell", () => {
    expect(buildCsv(["a", "b"], [['x,"y"', null]])).toBe('a,b\n"x,""y""",');
  });

  it("keeps a name that starts with a formula character as text", () => {
    const csv = buildCsv(["name"], [["=SUM(A1)"], ["-2+3"], ["@sum"], ["+1"]]);
    expect(csv.split("\n").slice(1)).toEqual(["'=SUM(A1)", "'-2+3", "'@sum", "'+1"]);
  });

  it("leaves negative numbers alone", () => {
    expect(buildCsv(["n"], [[-5]])).toBe("n\n-5");
  });
});

describe("user report CSVs", () => {
  it("writes the idle users header and never an email column", () => {
    const csv = buildIdleUsersCsv([{ userId: "u1", fullName: null, lastActivityAt: "2026-07-01T00:00:00Z", daysIdle: 120, enrollments: 2 }]);
    expect(csv).toBe("user_id,name,last_activity_at,days_idle,enrollments\nu1,,2026-07-01T00:00:00Z,120,2");
    expect(csv.toLowerCase()).not.toContain("email");
  });

  it("writes one progress line per enrolment with a computed percent", () => {
    const lines = buildUserProgressCsv([progressRow]).split("\n");
    expect(lines[0]).toContain("percent_complete");
    expect(lines[1]).toBe('u1,"Ada, Lovelace",c1,AML & KYC,active,2026-10-01T00:00:00Z,,1,3,33,0,1,62.5,,2026-10-20T00:00:00Z');
  });

  it("returns just the header for no rows", () => {
    expect(buildIdleUsersCsv([])).toBe("user_id,name,last_activity_at,days_idle,enrollments");
  });
});

function fakeRpc(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("user report queries", () => {
  it("maps idle user rows and passes the range", async () => {
    const { client, rpc } = fakeRpc([{ user_id: "u1", full_name: "A", last_activity_at: "t", days_idle: 40, enrollments: 1 }]);
    expect(await getIdleUsers(client, 30)).toEqual([{ userId: "u1", fullName: "A", lastActivityAt: "t", daysIdle: 40, enrollments: 1 }]);
    expect(rpc).toHaveBeenCalledWith("admin_report_idle_users", { p_days: 30 });
  });

  it("turns a numeric string percent into a number", async () => {
    const { client } = fakeRpc([
      {
        user_id: "u",
        full_name: null,
        course_id: "c",
        course_title: "T",
        enrollment_status: "active",
        enrolled_at: "a",
        completed_at: null,
        lessons_completed: 0,
        lessons_total: 0,
        assessments_passed: 0,
        assessments_total: 0,
        best_assessment_percent: "87.50",
        certificate_status: null,
        last_activity_at: "a",
      },
    ]);
    expect((await getUserProgress(client, 7))[0].bestAssessmentPercent).toBe(87.5);
  });

  it("throws when the database refuses", async () => {
    const { client } = fakeRpc(null, { message: "not allowed" });
    await expect(getIdleUsers(client, 30)).rejects.toThrow("admin_report_idle_users failed: not allowed");
  });
});

describe("generateReportCsv for the user reports", () => {
  it("builds the idle users file and reports its row count", async () => {
    const { client } = fakeRpc([{ user_id: "u1", full_name: "A", last_activity_at: "t", days_idle: 40, enrollments: 0 }]);
    const result = await generateReportCsv(client, { type: "idle_users", rangeDays: 30 });
    expect(result).toMatchObject({ ok: true, rowCount: 1 });
  });

  it("builds the progress file", async () => {
    const { client, rpc } = fakeRpc([]);
    const result = await generateReportCsv(client, { type: "individual_user_progress", rangeDays: 90 });
    expect(result).toMatchObject({ ok: true, rowCount: 0 });
    expect(rpc).toHaveBeenCalledWith("admin_report_user_progress", { p_days: 90 });
  });

  it("still refuses user product duration, which has no data yet", async () => {
    const { client, rpc } = fakeRpc([]);
    expect(await generateReportCsv(client, { type: "user_product_duration", rangeDays: 30 })).toEqual({
      ok: false,
      error: "This report is not available yet.",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
