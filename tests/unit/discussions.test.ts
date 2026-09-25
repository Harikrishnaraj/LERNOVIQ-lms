import { describe, expect, it } from "vitest";
import { filterThreads, validateReason, validateReply, validateThread, type ThreadSummary } from "@/features/discussions/discussions";

describe("validateThread", () => {
  it("trims, collapses whitespace in the title, and accepts a valid thread", () => {
    expect(validateThread({ title: "  How   do I  start? ", body: "  Please help  " })).toEqual({ ok: true, title: "How do I start?", body: "Please help" });
  });

  it("reports each missing or oversized field", () => {
    expect(validateThread({ title: "ab", body: "" })).toEqual({
      ok: false,
      errors: { title: "Give the discussion a title of at least 3 characters.", body: "Write your question or topic." },
    });
    const r = validateThread({ title: "x".repeat(201), body: "y".repeat(5001) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.title).toMatch(/under 200/);
      expect(r.errors.body).toMatch(/under 5,000/);
    }
    expect(validateThread({ title: 5, body: null }).ok).toBe(false);
  });
});

describe("validateReply / validateReason", () => {
  it("requires content within the limit", () => {
    expect(validateReply("  hi  ")).toEqual({ ok: true, body: "hi" });
    expect(validateReply("   ")).toEqual({ ok: false, error: "Write a reply first." });
    expect(validateReply("x".repeat(5001))).toMatchObject({ ok: false });
    expect(validateReply(undefined)).toMatchObject({ ok: false });
  });

  it("requires a short reason for reports", () => {
    expect(validateReason("spam")).toEqual({ ok: true, reason: "spam" });
    expect(validateReason("no")).toMatchObject({ ok: false });
    expect(validateReason("x".repeat(1001))).toMatchObject({ ok: false });
  });
});

describe("filterThreads", () => {
  const t = (id: string, over: Partial<ThreadSummary>): ThreadSummary => ({
    id, courseId: "c", courseSlug: "a", courseTitle: "A", title: id, body: "", authorName: "x", createdAt: "2026-01-01T00:00:00Z",
    replies: 0, votes: 0, answered: false, pinned: false, mine: false, ...over,
  });
  const list = [t("1", { answered: true }), t("2", { mine: true }), t("3", { courseSlug: "b" })];

  it("filters by status and course", () => {
    expect(filterThreads(list, "all", "").map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(filterThreads(list, "unanswered", "").map((x) => x.id)).toEqual(["2", "3"]);
    expect(filterThreads(list, "mine", "").map((x) => x.id)).toEqual(["2"]);
    expect(filterThreads(list, "all", "b").map((x) => x.id)).toEqual(["3"]);
    expect(filterThreads(list, "unanswered", "a").map((x) => x.id)).toEqual(["2"]);
  });
});
