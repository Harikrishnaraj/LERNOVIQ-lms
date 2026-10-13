// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { EMBEDDING_DIMENSIONS, getEmbeddingProvider } from "@/services/embeddings";
import { MAX_BATCH, createOpenAIEmbeddingProvider } from "@/services/embeddings/openai";
import { createFakeEmbeddingProvider, fakeVector } from "@/services/embeddings/fake";
import { redact } from "@/lib/log/redact";

// F-800 (T-220): embeddings go through one adapter; failures are recoverable results.

const vec = (fill: number) => new Array<number>(EMBEDDING_DIMENSIONS).fill(fill);
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getEmbeddingProvider", () => {
  it("uses the offline fake under Vitest so tests never call a paid API", () => {
    expect(getEmbeddingProvider().name).toBe("fake");
    expect(getEmbeddingProvider({ AI_PROVIDER: "fake" }).name).toBe("fake");
  });

  it("returns a not-configured provider without OPENAI_API_KEY", async () => {
    const provider = getEmbeddingProvider({});
    expect(provider).toMatchObject({ name: "openai", model: "text-embedding-3-small" });
    expect(await provider.embed(["hi"])).toMatchObject({
      ok: false,
      reason: "not_configured",
      code: "missing_api_key",
    });
  });

  it("builds the OpenAI provider from OPENAI_API_KEY", () => {
    expect(getEmbeddingProvider({ OPENAI_API_KEY: "sk-test" })).toMatchObject({ name: "openai" });
  });
});

describe("OpenAI embedding adapter", () => {
  it("sends the batch and returns vectors in input order with the billed tokens", async () => {
    const fetchImpl = vi.fn(async () =>
      // Provider returns them out of order; the adapter restores input order.
      jsonResponse({
        data: [
          { index: 1, embedding: vec(2) },
          { index: 0, embedding: vec(1) },
        ],
        usage: { total_tokens: 7 },
      }),
    );
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "sk-test",
      fetchImpl: fetchImpl as never,
    });
    const result = await provider.embed(["first", "second"]);

    expect(result).toMatchObject({
      ok: true,
      provider: "openai",
      model: "text-embedding-3-small",
      tokens: 7,
    });
    if (result.ok) {
      expect(result.vectors[0][0]).toBe(1);
      expect(result.vectors[1][0]).toBe(2);
    }
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(JSON.parse(init.body as string)).toEqual({
      model: "text-embedding-3-small",
      input: ["first", "second"],
      dimensions: EMBEDDING_DIMENSIONS,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
  });

  it("makes no request for an empty batch and refuses an oversized one", async () => {
    const fetchImpl = vi.fn();
    const provider = createOpenAIEmbeddingProvider({ apiKey: "k", fetchImpl: fetchImpl as never });
    expect(await provider.embed([])).toMatchObject({ ok: true, vectors: [], tokens: 0 });
    expect(await provider.embed(new Array(MAX_BATCH + 1).fill("x"))).toMatchObject({
      ok: false,
      code: "batch_too_large",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, "not_configured", "provider_auth_failed"],
    [429, "rate_limited", "provider_rate_limited"],
    [503, "error", "provider_http_503"],
  ])("classifies HTTP %i as %s", async (status, reason, code) => {
    const provider = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: (async () => jsonResponse({}, status)) as never,
    });
    expect(await provider.embed(["x"])).toMatchObject({ ok: false, reason, code });
  });

  it("never throws: timeouts and network errors become results", async () => {
    const timeout = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: (async () => {
        throw new DOMException("timed out", "TimeoutError");
      }) as never,
    });
    expect(await timeout.embed(["x"])).toMatchObject({ ok: false, reason: "timeout" });

    const down = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as never,
    });
    expect(await down.embed(["x"])).toMatchObject({
      ok: false,
      reason: "error",
      code: "provider_connection",
    });
  });

  it("rejects a response with the wrong vector count or size", async () => {
    const wrongCount = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: (async () => jsonResponse({ data: [{ index: 0, embedding: vec(1) }] })) as never,
    });
    expect(await wrongCount.embed(["a", "b"])).toMatchObject({ ok: false, code: "bad_response" });

    const wrongSize = createOpenAIEmbeddingProvider({
      apiKey: "k",
      fetchImpl: (async () =>
        jsonResponse({ data: [{ index: 0, embedding: [1, 2, 3] }] })) as never,
    });
    expect(await wrongSize.embed(["a"])).toMatchObject({ ok: false, code: "bad_response" });
  });
});

describe("fake embedding provider", () => {
  it("is deterministic, unit length and the right size", () => {
    const a = fakeVector("closures capture variables");
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(a).toEqual(fakeVector("closures capture variables"));
    expect(dot(a, a)).toBeCloseTo(1, 5);
  });

  it("ranks texts that share words above unrelated ones", () => {
    const q = fakeVector("how do closures capture variables");
    const related = fakeVector("a closure captures variables from its scope");
    const unrelated = fakeVector("photosynthesis happens in chloroplasts");
    expect(dot(q, related)).toBeGreaterThan(dot(q, unrelated));
  });

  it("can simulate failure", async () => {
    expect(await createFakeEmbeddingProvider({ fail: "timeout" }).embed(["x"])).toMatchObject({
      ok: false,
      reason: "timeout",
    });
  });
});

describe("OpenAI keys in logs", () => {
  it("are redacted", () => {
    const key = "sk-proj-abcdefghijklmnop1234567890";
    expect(JSON.stringify(redact({ detail: `bad key ${key}` }))).not.toContain(key);
  });
});
