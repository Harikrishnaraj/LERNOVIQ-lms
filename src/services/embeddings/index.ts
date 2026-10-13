import { createFakeEmbeddingProvider } from "./fake";
import { OPENAI_EMBEDDING_MODEL, createOpenAIEmbeddingProvider } from "./openai";
import type { EmbeddingProvider } from "./types";

export { EMBEDDING_DIMENSIONS } from "./types";
export type { EmbedFailureReason, EmbedResult, EmbeddingProvider } from "./types";

// Server-only entry point for embeddings (ADR-015, ADR-041). Every embedding call in the app goes
// through getEmbeddingProvider(); feature code never talks to a provider directly.

/** Used when no key is set: every call fails with a recoverable "not configured" result. */
function unconfiguredProvider(): EmbeddingProvider {
  return {
    name: "openai",
    model: OPENAI_EMBEDDING_MODEL,
    async embed() {
      return {
        ok: false,
        provider: "openai",
        model: OPENAI_EMBEDDING_MODEL,
        reason: "not_configured",
        code: "missing_api_key",
      };
    },
  };
}

export function getEmbeddingProvider(
  env: Record<string, string | undefined> = process.env,
): EmbeddingProvider {
  // Tests and CI never reach a paid API (Vitest sets VITEST).
  if (env.AI_PROVIDER === "fake" || env.VITEST) return createFakeEmbeddingProvider();
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return unconfiguredProvider();
  return createOpenAIEmbeddingProvider({ apiKey });
}
