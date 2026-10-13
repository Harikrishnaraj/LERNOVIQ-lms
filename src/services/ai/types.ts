// Provider-neutral chat contract (ADR-015). Feature code depends on these types only, never on a
// provider SDK, so the model behind the tutor can change without touching the features.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Upper bound on the answer length. */
  maxOutputTokens?: number;
  temperature?: number;
}

export interface ChatUsage {
  inputTokens: number;
  /** Input tokens the provider served from its prompt cache (already included in inputTokens). */
  cachedInputTokens: number;
  outputTokens: number;
}

/**
 * Why a call produced no answer. Each maps to a recoverable message in the UI (TEST_PLAN §15:
 * "AI failure produces recoverable UI", "Timeout produces safe fallback") and to ai_messages.status.
 */
export type ChatFailureReason = "not_configured" | "rate_limited" | "timeout" | "error";

interface ChatOutcomeBase {
  provider: string;
  model: string;
  latencyMs: number;
}

export type ChatResult =
  | (ChatOutcomeBase & {
      ok: true;
      text: string;
      /** "length" means the answer hit maxOutputTokens and is cut short. */
      finishReason: "stop" | "length" | "other";
      usage: ChatUsage;
    })
  | (ChatOutcomeBase & {
      ok: false;
      reason: ChatFailureReason;
      /** Short machine code for logs and ai_messages.error_code; never shown to learners. */
      code: string;
    });

export interface ChatProvider {
  readonly name: string;
  readonly model: string;
  /** Never throws: every failure comes back as `{ ok: false }`. */
  complete(request: ChatRequest): Promise<ChatResult>;
}
