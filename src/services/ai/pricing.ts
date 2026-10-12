import type { ChatUsage } from "./types";

// USD per million tokens for the Groq models this account can use (model list checked live
// 2026-10-12; prices from published listings, confirm on groq.com/pricing when changing). Cached
// input is charged at the full input rate here, so recorded costs never come out lower than the bill.
const PRICES: Record<string, { input: number; output: number }> = {
  "openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
  "openai/gpt-oss-20b": { input: 0.075, output: 0.3 },
  // The offline test provider costs nothing.
  "fake-tutor-1": { input: 0, output: 0 },
};

/** Cost of one call in USD (6 decimal places), or null when the model has no known price. */
export function costUsd(model: string, usage: ChatUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const cost = (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
