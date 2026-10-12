import { createFakeProvider } from "./fake";
import { createGroqProvider } from "./groq";
import type { ChatProvider } from "./types";

export type {
  ChatMessage,
  ChatProvider,
  ChatRequest,
  ChatResult,
  ChatUsage,
  ChatFailureReason,
} from "./types";
export { costUsd } from "./pricing";

// Server-only entry point for AI chat (ADR-015, ADR-040). Every AI call in the app goes through
// getChatProvider(); feature code never imports a provider SDK.

export const DEFAULT_TUTOR_MODEL = "openai/gpt-oss-120b";

/** Used when no key is set: every call fails with a recoverable "not configured" result. */
function unconfiguredProvider(model: string): ChatProvider {
  return {
    name: "groq",
    model,
    async complete() {
      return {
        ok: false,
        provider: "groq",
        model,
        latencyMs: 0,
        reason: "not_configured",
        code: "missing_api_key",
      };
    },
  };
}

export function getChatProvider(
  env: Record<string, string | undefined> = process.env,
): ChatProvider {
  const model = env.AI_TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL;
  // Tests and CI never reach a paid API (Vitest sets VITEST).
  if (env.AI_PROVIDER === "fake" || env.VITEST) return createFakeProvider();
  const apiKey = env.GROQ_AI_API_KEY?.trim();
  if (!apiKey) return unconfiguredProvider(model);
  return createGroqProvider({ apiKey, model });
}
