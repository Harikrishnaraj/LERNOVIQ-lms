// Provider-neutral embedding contract (ADR-015, ADR-041). Feature code depends on these types only.

export const EMBEDDING_DIMENSIONS = 1536;

export type EmbedFailureReason = "not_configured" | "rate_limited" | "timeout" | "error";

export type EmbedResult =
  | {
      ok: true;
      provider: string;
      model: string;
      /** One vector per input text, in order. */
      vectors: number[][];
      /** Tokens the provider billed for this call. */
      tokens: number;
    }
  | {
      ok: false;
      provider: string;
      model: string;
      reason: EmbedFailureReason;
      /** Short machine code for logs and job errors; never shown to learners. */
      code: string;
    };

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  /** Never throws: every failure comes back as `{ ok: false }`. */
  embed(texts: string[]): Promise<EmbedResult>;
}
