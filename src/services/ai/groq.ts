import Groq, {
  APIConnectionTimeoutError,
  APIError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
} from "groq-sdk";
import type { ChatProvider, ChatRequest, ChatResult } from "./types";

// Groq chat adapter (ADR-040). Server-only: reads the API key, which must never reach the browser.

/** Models that think out loud inside the answer wrap it in <think>…</think>; learners never see it. */
const THINK_BLOCK = /<think>[\s\S]*?<\/think>\s*/g;

type GroqLike = Pick<Groq, "chat">;

export interface GroqProviderOptions {
  apiKey: string;
  model: string;
  /** Per-attempt timeout. The SDK retries once, so the worst case is about twice this. */
  timeoutMs?: number;
  /** Injected in tests; built from the key otherwise. */
  client?: GroqLike;
}

export function createGroqProvider(options: GroqProviderOptions): ChatProvider {
  const { model } = options;
  const client: GroqLike =
    options.client ??
    new Groq({ apiKey: options.apiKey, timeout: options.timeoutMs ?? 30_000, maxRetries: 1 });

  return {
    name: "groq",
    model,
    async complete(request: ChatRequest): Promise<ChatResult> {
      const started = Date.now();
      const base = () => ({ provider: "groq", model, latencyMs: Date.now() - started });
      try {
        const completion = await client.chat.completions.create({
          model,
          messages: request.messages,
          max_completion_tokens: request.maxOutputTokens ?? 1024,
          temperature: request.temperature ?? 0.2,
          stream: false,
        });
        const choice = completion.choices[0];
        const text = (choice?.message?.content ?? "").replace(THINK_BLOCK, "").trim();
        const usage = completion.usage;
        return {
          ...base(),
          ok: true,
          model: completion.model || model,
          text,
          finishReason:
            choice?.finish_reason === "stop"
              ? "stop"
              : choice?.finish_reason === "length"
                ? "length"
                : "other",
          usage: {
            inputTokens: usage?.prompt_tokens ?? 0,
            cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
            outputTokens: usage?.completion_tokens ?? 0,
          },
        };
      } catch (err) {
        return { ...base(), ok: false, ...classifyGroqError(err) };
      }
    },
  };
}

/** Maps SDK errors to the provider-neutral failure reasons. Exported for tests. */
export function classifyGroqError(err: unknown): {
  reason: "rate_limited" | "timeout" | "not_configured" | "error";
  code: string;
} {
  if (err instanceof APIConnectionTimeoutError) return { reason: "timeout", code: "timeout" };
  if (err instanceof RateLimitError)
    return { reason: "rate_limited", code: "provider_rate_limited" };
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return { reason: "not_configured", code: "provider_auth_failed" };
  }
  if (err instanceof APIError)
    return {
      reason: "error",
      code: err.status ? `provider_http_${err.status}` : "provider_connection",
    };
  return { reason: "error", code: "unexpected" };
}
