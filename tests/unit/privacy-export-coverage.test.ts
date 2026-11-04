import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getMyDataExport } from "@/features/privacy/account";

// F-441 (T-295): the export covers every category held about the person, and never other people's messages.
type Call = { table: string; filters: [string, string, unknown][] };

function fakeClient(calls: Call[]): SupabaseClient {
  return {
    from(table: string) {
      const call: Call = { table, filters: [] };
      calls.push(call);
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => (call.filters.push(["eq", col, v]), q),
        in: (col: string, v: unknown) => (call.filters.push(["in", col, v]), q),
        maybeSingle: () => Promise.resolve({ data: null }),
        then: (ok: (r: { data: unknown[] }) => unknown) =>
          Promise.resolve({ data: table === "enrollments" ? [{ id: "e1", course_id: "c1" }] : [] }).then(ok),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("data export coverage", () => {
  it("includes learning activity, posts, sent messages and sign-in history", async () => {
    const calls: Call[] = [];
    const out = await getMyDataExport(fakeClient(calls), "u1", fakeClient(calls));
    for (const key of ["lessonProgress", "learningTime", "assessmentAttempts", "discussionThreads", "discussionPosts", "sentMessages", "loginHistory"]) {
      expect(out).toHaveProperty(key);
    }
    expect(calls.find((c) => c.table === "lesson_progress")?.filters).toContainEqual(["in", "enrollment_id", ["e1"]]);
  });

  it("exports only messages the person sent", async () => {
    const calls: Call[] = [];
    await getMyDataExport(fakeClient(calls), "u1", fakeClient(calls));
    expect(calls.find((c) => c.table === "direct_messages")?.filters).toEqual([["eq", "sender_id", "u1"]]);
  });
});
