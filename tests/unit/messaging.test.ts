import { describe, expect, it } from "vitest";
import {
  computeTotalUnread,
  filterMessageThreads,
  validateDirectMessage,
} from "@/features/messaging/messaging";
import type { InstructorMessageThread } from "@/features/messaging/types";

describe("validateDirectMessage", () => {
  it("validates and trims normal message", () => {
    const res = validateDirectMessage("  Hello student!  ");
    expect(res).toEqual({ ok: true, body: "Hello student!" });
  });

  it("rejects empty or whitespace-only messages", () => {
    expect(validateDirectMessage("")).toEqual({ ok: false, error: "Write a message first." });
    expect(validateDirectMessage("   \n  ")).toEqual({ ok: false, error: "Write a message first." });
    expect(validateDirectMessage(null)).toEqual({ ok: false, error: "Write a message first." });
  });

  it("rejects messages exceeding 4000 chars", () => {
    const res = validateDirectMessage("a".repeat(4001));
    expect(res.ok).toBe(false);
  });
});

describe("filterMessageThreads and computeTotalUnread", () => {
  const threads: InstructorMessageThread[] = [
    {
      threadId: "t1",
      courseId: "c1",
      courseTitle: "Next.js Mastery",
      learnerId: "l1",
      learnerName: "Ada Lovelace",
      lastMessage: "I need help with server components",
      lastMessageAt: "2026-09-25T12:00:00Z",
      unreadCount: 2,
    },
    {
      threadId: "t2",
      courseId: "c2",
      courseTitle: "TypeScript In Depth",
      learnerId: "l2",
      learnerName: "Grace Hopper",
      lastMessage: "All clear, thank you!",
      lastMessageAt: "2026-09-25T11:00:00Z",
      unreadCount: 0,
    },
  ];

  it("computes total unread count correctly", () => {
    expect(computeTotalUnread(threads)).toBe(2);
  });

  it("filters threads by learner name", () => {
    const res = filterMessageThreads(threads, "lovelace");
    expect(res.map((t) => t.threadId)).toEqual(["t1"]);
  });

  it("filters threads by course title", () => {
    const res = filterMessageThreads(threads, "typescript");
    expect(res.map((t) => t.threadId)).toEqual(["t2"]);
  });

  it("filters threads by message content", () => {
    const res = filterMessageThreads(threads, "components");
    expect(res.map((t) => t.threadId)).toEqual(["t1"]);
  });
});
