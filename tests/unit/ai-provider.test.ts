// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  InternalServerError,
  RateLimitError,
} from "groq-sdk";
import { DEFAULT_TUTOR_MODEL, costUsd, getChatProvider } from "@/services/ai";
import { classifyGroqError, createGroqProvider } from "@/services/ai/groq";
import { createFakeProvider } from "@/services/ai/fake";
import { isSecretKey, redact } from "@/lib/log/redact";

// F-700 (T-200): every AI call goes through the adapter; failures are recoverable results.

const request = { messages: [{ role: "user" as const, content: "What is a closure?" }] };

function stubClient(create: (...args: unknown[]) => Promise<unknown>) {
  return { chat: { completions: { create: vi.fn(create) } } } as never;
}

describe("getChatProvider", () => {
  it("uses the offline fake provider under Vitest so tests never call a paid API", () => {
    expect(getChatProvider().name).toBe("fake");
    expect(getChatProvider({ AI_PROVIDER: "fake" }).name).toBe("fake");
  });

  it("returns a not-configured provider when no Groq key is set", async () => {
    const provider = getChatProvider({});
    expect(provider).toMatchObject({ name: "groq", model: DEFAULT_TUTOR_MODEL });
    const result = await provider.complete(request);
    expect(result).toMatchObject({ ok: false, reason: "not_configured", code: "missing_api_key" });
  });

  it("builds the Groq provider from GROQ_AI_API_KEY, with AI_TUTOR_MODEL overriding the model", () => {
    const provider = getChatProvider({
      GROQ_AI_API_KEY: "gsk_test",
      AI_TUTOR_MODEL: " llama-3.3-70b-versatile ",
    });
    expect(provider).toMatchObject({ name: "groq", model: "llama-3.3-70b-versatile" });
  });
});

describe("Groq adapter", () => {
  it("maps a completion to text, finish reason and usage, hiding <think> blocks", async () => {
    const create = vi.fn(async () => ({
      model: "openai/gpt-oss-120b",
      choices: [
        {
          finish_reason: "stop",
          message: { content: "<think>internal</think>\nA closure keeps its scope." },
        },
      ],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 30,
        prompt_tokens_details: { cached_tokens: 100 },
      },
    }));
    const provider = createGroqProvider({
      apiKey: "x",
      model: "openai/gpt-oss-120b",
      client: stubClient(create),
    });
    const result = await provider.complete({ ...request, maxOutputTokens: 300 });

    expect(result).toMatchObject({
      ok: true,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      text: "A closure keeps its scope.",
      finishReason: "stop",
      usage: { inputTokens: 120, cachedInputTokens: 100, outputTokens: 30 },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "openai/gpt-oss-120b",
        max_completion_tokens: 300,
        stream: false,
        messages: request.messages,
      }),
    );
  });

  it("reports a truncated answer as finishReason length", async () => {
    const provider = createGroqProvider({
      apiKey: "x",
      model: "m",
      client: stubClient(async () => ({
        model: "m",
        choices: [{ finish_reason: "length", message: { content: "Partial" } }],
      })),
    });
    expect(await provider.complete(request)).toMatchObject({
      ok: true,
      finishReason: "length",
      usage: { inputTokens: 0, outputTokens: 0 },
    });
  });

  it("never throws: a timeout becomes a recoverable result", async () => {
    const provider = createGroqProvider({
      apiKey: "x",
      model: "m",
      client: stubClient(async () => {
        throw new APIConnectionTimeoutError();
      }),
    });
    const result = await provider.complete(request);
    expect(result).toMatchObject({
      ok: false,
      reason: "timeout",
      code: "timeout",
      provider: "groq",
      model: "m",
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it.each([
    [
      new RateLimitError(429, undefined, "slow down", new Headers()),
      "rate_limited",
      "provider_rate_limited",
    ],
    [
      new AuthenticationError(401, undefined, "bad key", new Headers()),
      "not_configured",
      "provider_auth_failed",
    ],
    [new InternalServerError(503, undefined, "down", new Headers()), "error", "provider_http_503"],
    [new APIConnectionError({ message: "reset" }), "error", "provider_connection"],
    [new Error("boom"), "error", "unexpected"],
  ])("classifies %o as %s", (err, reason, code) => {
    expect(classifyGroqError(err)).toEqual({ reason, code });
  });
});

describe("costUsd", () => {
  it("prices known models per million tokens", () => {
    // 1M input × $0.15 + 1M output × $0.60
    expect(
      costUsd("openai/gpt-oss-120b", {
        inputTokens: 1_000_000,
        cachedInputTokens: 0,
        outputTokens: 1_000_000,
      }),
    ).toBe(0.75);
    expect(
      costUsd("openai/gpt-oss-120b", {
        inputTokens: 5000,
        cachedInputTokens: 0,
        outputTokens: 700,
      }),
    ).toBe(0.00117);
  });

  it("records null, never a guess, for a model without a known price", () => {
    expect(
      costUsd("unknown/model", { inputTokens: 10, cachedInputTokens: 0, outputTokens: 10 }),
    ).toBeNull();
  });
});

describe("fake provider", () => {
  it("is deterministic", async () => {
    const a = await createFakeProvider().complete(request);
    const b = await createFakeProvider().complete(request);
    expect(a).toEqual(b);
    expect(a).toMatchObject({
      ok: true,
      text: "Fake answer to: What is a closure?",
      usage: { inputTokens: 5, outputTokens: 9 },
    });
  });

  it("can simulate each failure reason", async () => {
    expect(await createFakeProvider({ fail: "timeout" }).complete(request)).toMatchObject({
      ok: false,
      reason: "timeout",
    });
  });
});

describe("Groq keys in logs", () => {
  it("are redacted wherever they appear", () => {
    expect(isSecretKey("GROQ_AI_API_KEY")).toBe(true);
    expect(
      JSON.stringify(redact({ detail: "auth failed for gsk_abcdefgh12345678" })),
    ).not.toContain("gsk_abcdefgh12345678");
  });
});
