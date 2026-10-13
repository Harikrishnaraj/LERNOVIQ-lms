import type { ChatFailureReason, ChatProvider, ChatRequest, ChatResult } from "./types";

// Deterministic offline provider for tests and CI (ADR-040: CI never calls a paid API). Its answer
// and token counts depend only on the request, so assertions can be exact.

export interface FakeProviderOptions {
  /**
   * Fixed answer. By default it echoes the last user message and, like a grounded answer, cites
   * the first course passage when the prompt has one (the tutor tags passages `<passage id="S1"`).
   */
  reply?: string;
  /** Make every call fail with this reason. */
  fail?: ChatFailureReason;
  model?: string;
}

const approxTokens = (text: string) => Math.ceil(text.length / 4);

export function createFakeProvider(options: FakeProviderOptions = {}): ChatProvider {
  const model = options.model ?? "fake-tutor-1";
  return {
    name: "fake",
    model,
    async complete(request: ChatRequest): Promise<ChatResult> {
      if (options.fail)
        return {
          ok: false,
          provider: "fake",
          model,
          latencyMs: 0,
          reason: options.fail,
          code: `fake_${options.fail}`,
        };
      const lastUser =
        [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";
      const hasPassage = request.messages.some((m) => m.content.includes('<passage id="S1"'));
      const text = options.reply ?? `Fake answer to: ${lastUser}${hasPassage ? " [S1]" : ""}`;
      return {
        ok: true,
        provider: "fake",
        model,
        latencyMs: 0,
        text,
        finishReason: "stop",
        usage: {
          inputTokens: request.messages.reduce((sum, m) => sum + approxTokens(m.content), 0),
          cachedInputTokens: 0,
          outputTokens: approxTokens(text),
        },
      };
    },
  };
}
