// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_QUESTION_CHARS,
  checkTutorAllowance,
  getTutorMode,
  validateQuestion,
} from "@/features/ai/policy";
import { assistantRow, runChatTurn } from "@/features/ai/usage";
import { createFakeProvider } from "@/services/ai/fake";
import { rateLimit } from "@/services/rate-limit";

// F-700 (T-200): policy decisions and usage/cost recording.

describe("validateQuestion", () => {
  it("trims and accepts a normal question", () => {
    expect(validateQuestion("  What is recursion?  ")).toEqual({
      ok: true,
      question: "What is recursion?",
    });
  });

  it.each([[""], ["   "], [42], [null]])("rejects an empty or non-text question (%o)", (raw) => {
    expect(validateQuestion(raw)).toMatchObject({ ok: false });
  });

  it("rejects an over-long question", () => {
    expect(validateQuestion("x".repeat(MAX_QUESTION_CHARS + 1))).toMatchObject({ ok: false });
    expect(validateQuestion("x".repeat(MAX_QUESTION_CHARS))).toMatchObject({ ok: true });
  });
});

describe("getTutorMode", () => {
  const client = (result: { data: unknown; error: unknown }) =>
    ({ rpc: vi.fn(async () => result) }) as unknown as SupabaseClient;

  it("is hint_only while a graded attempt is in progress in the course", async () => {
    const supabase = client({ data: true, error: null });
    expect(await getTutorMode(supabase, "course-1")).toBe("hint_only");
    expect(supabase.rpc).toHaveBeenCalledWith("has_active_graded_attempt", {
      p_course_id: "course-1",
    });
  });

  it("is full otherwise", async () => {
    expect(await getTutorMode(client({ data: false, error: null }), "course-1")).toBe("full");
  });

  it("fails closed to hint_only when the check errors", async () => {
    expect(await getTutorMode(client({ data: null, error: { message: "down" } }), "course-1")).toBe(
      "hint_only",
    );
  });
});

describe("checkTutorAllowance", () => {
  it("checks the burst limit and the daily cap for the user", async () => {
    vi.mocked(rateLimit).mockClear();
    expect(await checkTutorAllowance("user-1")).toBe(true);
    expect(rateLimit).toHaveBeenCalledWith("ai-tutor", "1.2.3.4", "user-1");
    expect(rateLimit).toHaveBeenCalledWith("ai-tutor-daily", "1.2.3.4", "user-1");
  });

  it("blocks once either limit is reached", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await checkTutorAllowance("user-1")).toBe(false);
  });
});

/** Minimal in-memory stand-in for the service-role client: just the calls runChatTurn makes. */
function memoryDb(seed: { conversations?: { id: string; user_id: string }[] } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    ai_conversations: [...(seed.conversations ?? [])],
    ai_messages: [],
  };
  let nextId = 1;
  const db = {
    tables,
    from(table: string) {
      const rows = tables[table];
      return {
        select: () => {
          const filters: [string, unknown][] = [];
          const chain = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return chain;
            },
            async maybeSingle() {
              return {
                data: rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null,
                error: null,
              };
            },
          };
          return chain;
        },
        insert(row: Record<string, unknown>) {
          const stored = { id: `id-${nextId++}`, ...row };
          rows.push(stored);
          const done = Promise.resolve({ error: null });
          return Object.assign(done, {
            select: () => ({ single: async () => ({ data: { id: stored.id }, error: null }) }),
          });
        },
        update(values: Record<string, unknown>) {
          return {
            eq: async (col: string, val: unknown) => {
              rows.filter((r) => r[col] === val).forEach((r) => Object.assign(r, values));
              return { error: null };
            },
          };
        },
      };
    },
  };
  return db;
}

describe("runChatTurn", () => {
  const base = {
    provider: createFakeProvider({ reply: "Use a base case." }),
    userId: "user-1",
    feature: "tutor" as const,
    courseId: "course-1",
    lessonId: "lesson-1",
    context: [{ role: "system" as const, content: "You are a tutor." }],
    question: "How do I stop recursion?",
  };

  it("starts a conversation and records the question and the answer with usage and cost", async () => {
    const db = memoryDb();
    const out = await runChatTurn({ ...base, db: db as unknown as SupabaseClient });

    expect(out).toMatchObject({ ok: true, result: { ok: true, text: "Use a base case." } });
    expect(db.tables.ai_conversations).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        feature: "tutor",
        course_id: "course-1",
        lesson_id: "lesson-1",
        title: base.question,
      }),
    ]);
    expect(db.tables.ai_messages).toEqual([
      expect.objectContaining({ role: "user", content: base.question }),
      expect.objectContaining({
        role: "assistant",
        content: "Use a base case.",
        status: "ok",
        provider: "fake",
        model: "fake-tutor-1",
        input_tokens: 10,
        output_tokens: 4,
        cost_usd: 0,
      }),
    ]);
  });

  it("refuses to continue a conversation that belongs to someone else", async () => {
    const db = memoryDb({ conversations: [{ id: "c-other", user_id: "user-2" }] });
    const out = await runChatTurn({
      ...base,
      db: db as unknown as SupabaseClient,
      conversationId: "c-other",
    });
    expect(out).toEqual({ ok: false, error: "conversation_not_found" });
    expect(db.tables.ai_messages).toHaveLength(0);
  });

  it("records a provider failure and still returns it for a recoverable UI message", async () => {
    const db = memoryDb({ conversations: [{ id: "c-1", user_id: "user-1" }] });
    const out = await runChatTurn({
      ...base,
      db: db as unknown as SupabaseClient,
      conversationId: "c-1",
      provider: createFakeProvider({ fail: "timeout" }),
    });
    expect(out).toMatchObject({
      ok: true,
      conversationId: "c-1",
      result: { ok: false, reason: "timeout" },
    });
    expect(db.tables.ai_messages[1]).toMatchObject({
      role: "assistant",
      content: "",
      status: "timeout",
      error_code: "fake_timeout",
    });
  });
});

describe("assistantRow", () => {
  it("stores a null cost for a model without a known price", () => {
    const row = assistantRow("c-1", {
      ok: true,
      provider: "groq",
      model: "some/new-model",
      latencyMs: 12,
      text: "Hi",
      finishReason: "stop",
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 2 },
    });
    expect(row).toMatchObject({
      cost_usd: null,
      input_tokens: 10,
      output_tokens: 2,
      latency_ms: 12,
    });
  });
});
