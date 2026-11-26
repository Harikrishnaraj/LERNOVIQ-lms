import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The instructor CSV export carries the selected course AND date range to the roster RPC
// (report audit C38, C51, C13).

const rpcCalls: { fn: string; args: unknown }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      return { range: async () => ({ data: [], error: null }) };
    },
  }),
}));
vi.mock("@/services/rate-limit", () => ({ clientIp: async () => "127.0.0.1", rateLimit: async () => true }));
vi.mock("@/lib/log", () => ({ log: { error: vi.fn() } }));
const recordAudit = vi.fn<(entry: unknown) => Promise<boolean>>(async () => true);
vi.mock("@/services/audit", () => ({ recordAudit: (entry: unknown) => recordAudit(entry) }));

import { GET } from "@/app/instructor/analytics/export/route";

const COURSE = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("instructor analytics export route", () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    recordAudit.mockReset();
    recordAudit.mockResolvedValue(true);
  });

  it("passes the range and course to the export RPC", async () => {
    const res = await GET(new NextRequest(`http://localhost/instructor/analytics/export?range=90&course=${COURSE}`));
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([{ fn: "instructor_analytics_export_rows", args: { p_days: 90, p_course_id: COURSE } }]);
    expect(res.headers.get("content-disposition")).toContain(`analytics-course-${COURSE}-last-90-days-`);
    expect(await res.text()).toContain("Learning Time (min)");
  });

  it("defaults to the last 30 days across all courses", async () => {
    await GET(new NextRequest("http://localhost/instructor/analytics/export"));
    expect(rpcCalls[0]).toEqual({ fn: "instructor_analytics_export_rows", args: { p_days: 30, p_course_id: null } });
  });

  it("audits every export with the actor, course filter and row count (report audit C21)", async () => {
    await GET(new NextRequest(`http://localhost/instructor/analytics/export?range=90&course=${COURSE}`));
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        action: "instructor.analytics_exported",
        resourceType: "course",
        resourceId: COURSE,
        metadata: { courseId: COURSE, rangeDays: 90, exported: 0 },
      }),
    );
    await GET(new NextRequest("http://localhost/instructor/analytics/export"));
    expect(recordAudit).toHaveBeenLastCalledWith(expect.objectContaining({ resourceId: null, metadata: { courseId: "all", rangeDays: 30, exported: 0 } }));
  });

  it("still hands over the file when the audit write fails", async () => {
    recordAudit.mockResolvedValue(false);
    const res = await GET(new NextRequest("http://localhost/instructor/analytics/export"));
    expect(res.status).toBe(200);
  });
});
