import { beforeEach, describe, expect, it, vi } from "vitest";

// GAP-127: the message lands in the thread even when the student's alert is suppressed, so the
// instructor must not be told it "was not delivered"; a failed thread write is the real failure.

const { notifyMock, rpcMock, insertMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(),
  rpcMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/services/notifications", () => ({ notify: notifyMock }));
vi.mock("@/features/instructor/student-detail", () => ({
  validateStudentMessage: (m: string) => ({ ok: true, text: m }),
  getStudentDetail: async () => ({ userId: "learner-1", courseId: "course-1", courseTitle: "Algebra" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "instructor-1" } } }) },
    rpc: rpcMock,
    from: (table: string) =>
      table === "direct_messages"
        ? { insert: insertMock }
        : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "algebra" } }) }) }) },
  }),
}));

import { messageStudent } from "@/features/instructor/student-actions";

describe("messageStudent", () => {
  beforeEach(() => {
    notifyMock.mockReset();
    rpcMock.mockReset().mockResolvedValue({ data: "thread-1", error: null });
    insertMock.mockReset().mockResolvedValue({ error: null });
  });

  it("stores the message in the thread and alerts the student", async () => {
    notifyMock.mockResolvedValue(true);
    expect(await messageStudent("enrollment-1", "Hello")).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith({ thread_id: "thread-1", sender_id: "instructor-1", body: "Hello" });
  });

  it("reports success with a note when only the alert was suppressed", async () => {
    notifyMock.mockResolvedValue(false);
    const result = await messageStudent("enrollment-1", "Hello");
    expect(result).toMatchObject({ ok: true, notice: expect.stringContaining("not alerted") });
    expect(JSON.stringify(result)).not.toContain("not delivered");
  });

  it("fails without alerting anyone when the message cannot be stored", async () => {
    insertMock.mockResolvedValue({ error: { message: "insert failed" } });
    expect(await messageStudent("enrollment-1", "Hello")).toEqual({
      ok: false,
      error: "We could not send that message. Please try again.",
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("fails when the conversation cannot be opened", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "denied" } });
    expect(await messageStudent("enrollment-1", "Hello")).toMatchObject({ ok: false });
    expect(insertMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });
});
