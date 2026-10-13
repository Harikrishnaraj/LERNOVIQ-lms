import {
  EMBEDDING_DIMENSIONS,
  type EmbedFailureReason,
  type EmbedResult,
  type EmbeddingProvider,
} from "./types";

// Deterministic offline embeddings for tests and CI (ADR-041: CI never calls a paid API).
// Texts that share words get similar vectors, so retrieval tests can assert real ranking.

export interface FakeEmbeddingOptions {
  fail?: EmbedFailureReason;
}

/** FNV-1a hash of a word, used to pick which dimensions it lights up. */
function hash(word: string, seed: number): number {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function fakeVector(text: string): number[] {
  const v = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const w of words) {
    for (let seed = 0; seed < 3; seed++) v[hash(w, seed) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function createFakeEmbeddingProvider(options: FakeEmbeddingOptions = {}): EmbeddingProvider {
  const model = "fake-embed-1";
  return {
    name: "fake",
    model,
    async embed(texts: string[]): Promise<EmbedResult> {
      if (options.fail) {
        return {
          ok: false,
          provider: "fake",
          model,
          reason: options.fail,
          code: `fake_${options.fail}`,
        };
      }
      return {
        ok: true,
        provider: "fake",
        model,
        vectors: texts.map(fakeVector),
        tokens: texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0),
      };
    },
  };
}
