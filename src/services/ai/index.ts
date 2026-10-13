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

export interface ChatProviderOptions {
  /**
   * Model chosen by an admin (ai_settings.tutor_model, ADR-045). Overrides AI_TUTOR_MODEL; null
   * or empty falls back to it. The fake provider ignores it.
   */
  model?: string | null;
}

/** The model used when no admin override is set: AI_TUTOR_MODEL, else DEFAULT_TUTOR_MODEL. */
export function defaultTutorModel(env: Record<string, string | undefined> = process.env): string {
  return env.AI_TUTOR_MODEL?.trim() || DEFAULT_TUTOR_MODEL;
}

/** Which provider getChatProvider() would return, for the admin screen (never the key itself). */
export function describeChatProvider(env: Record<string, string | undefined> = process.env): {
  provider: "fake" | "groq";
  configured: boolean;
  defaultModel: string;
} {
  const fake = env.AI_PROVIDER === "fake" || Boolean(env.VITEST);
  return {
    provider: fake ? "fake" : "groq",
    configured: fake || Boolean(env.GROQ_AI_API_KEY?.trim()),
    defaultModel: defaultTutorModel(env),
  };
}

export function getChatProvider(
  env: Record<string, string | undefined> = process.env,
  options: ChatProviderOptions = {},
): ChatProvider {
  const model = options.model?.trim() || defaultTutorModel(env);
  // Tests and CI never reach a paid API (Vitest sets VITEST).
  if (env.AI_PROVIDER === "fake" || env.VITEST) return createFakeProvider();
  const apiKey = env.GROQ_AI_API_KEY?.trim();
  if (!apiKey) return unconfiguredProvider(model);
  return createGroqProvider({ apiKey, model });
}
