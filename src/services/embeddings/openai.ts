import { EMBEDDING_DIMENSIONS, type EmbedResult, type EmbeddingProvider } from "./types";

// OpenAI embeddings adapter (ADR-041). Server-only: reads the API key. Plain HTTPS, no SDK.

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
/** OpenAI accepts up to 2048 inputs per request; stay well below it. */
export const MAX_BATCH = 256;

export interface OpenAIEmbeddingOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
}

export function createOpenAIEmbeddingProvider(options: OpenAIEmbeddingOptions): EmbeddingProvider {
  const model = options.model ?? OPENAI_EMBEDDING_MODEL;
  const doFetch = options.fetchImpl ?? fetch;
  const fail = (
    reason: "rate_limited" | "timeout" | "not_configured" | "error",
    code: string,
  ): EmbedResult => ({
    ok: false,
    provider: "openai",
    model,
    reason,
    code,
  });

  return {
    name: "openai",
    model,
    async embed(texts: string[]): Promise<EmbedResult> {
      if (texts.length === 0)
        return { ok: true, provider: "openai", model, vectors: [], tokens: 0 };
      if (texts.length > MAX_BATCH) return fail("error", "batch_too_large");
      try {
        const res = await doFetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
        });
        if (res.status === 401 || res.status === 403)
          return fail("not_configured", "provider_auth_failed");
        if (res.status === 429) return fail("rate_limited", "provider_rate_limited");
        if (!res.ok) return fail("error", `provider_http_${res.status}`);

        const body = (await res.json()) as {
          data?: { index: number; embedding: number[] }[];
          usage?: { total_tokens?: number };
        };
        const ordered = [...(body.data ?? [])]
          .sort((a, b) => a.index - b.index)
          .map((d) => d.embedding);
        if (
          ordered.length !== texts.length ||
          ordered.some((v) => v.length !== EMBEDDING_DIMENSIONS)
        ) {
          return fail("error", "bad_response");
        }
        return {
          ok: true,
          provider: "openai",
          model,
          vectors: ordered,
          tokens: body.usage?.total_tokens ?? 0,
        };
      } catch (err) {
        if (
          err instanceof DOMException &&
          (err.name === "TimeoutError" || err.name === "AbortError")
        ) {
          return fail("timeout", "timeout");
        }
        return fail("error", "provider_connection");
      }
    },
  };
}
