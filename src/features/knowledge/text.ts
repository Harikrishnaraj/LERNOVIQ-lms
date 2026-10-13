import { createHash } from "node:crypto";

// Lesson text extraction and chunking for AI Tutor search (T-221, RAG_PLAN §4). Pure functions:
// no database or network, so the unit tests can pin down chunk boundaries exactly.

/** ~4 characters per token for English text; good enough for sizing chunks. */
export const approxTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const CHUNK_TARGET_TOKENS = 400;
/** About 15% of a chunk is repeated at the start of the next, so an idea split at a boundary survives. */
export const CHUNK_OVERLAP_TOKENS = 60;
/** knowledge_chunks.content allows 8000 characters; stay well under it including the prefix. */
const MAX_PARAGRAPH_CHARS = CHUNK_TARGET_TOKENS * 4;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Lesson HTML (already sanitized, RULES §6) to plain-text paragraphs. Block elements become
 * paragraph breaks, list items keep a bullet, code blocks keep their line breaks.
 */
export function htmlToParagraphs(html: string): string[] {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n\n• ")
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr|table|ul|ol|div)>/gi, "\n\n")
    .replace(/<(p|h[1-6]|blockquote|pre|tr|table|ul|ol|div|hr)[^>]*>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .replace(/[ \t\f\v ]+/g, " ")
        .replace(/ *\n */g, "\n")
        .trim(),
    )
    .filter((p) => p.length > 0 && p !== "•");
}

/** Splits an over-long paragraph at sentence ends, then at spaces, so no piece exceeds maxChars. */
function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const pieces: string[] = [];
  let rest = paragraph;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("? "),
      window.lastIndexOf("! "),
    );
    const cut =
      sentenceEnd > maxChars / 2
        ? sentenceEnd + 1
        : window.lastIndexOf(" ") > maxChars / 2
          ? window.lastIndexOf(" ")
          : maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

export interface Chunk {
  position: number;
  content: string;
  tokenCount: number;
  contentHash: string;
}

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Groups paragraphs into ~400-token chunks with ~60 tokens of overlap. Each chunk starts with the
 * breadcrumb ("Course › Section › Lesson") so it makes sense on its own and so keyword search
 * matches the course and lesson names too (ADR-042).
 */
export function chunkParagraphs(
  paragraphs: string[],
  breadcrumb: string,
  options: { targetTokens?: number; overlapTokens?: number } = {},
): Chunk[] {
  const target = options.targetTokens ?? CHUNK_TARGET_TOKENS;
  const overlap = options.overlapTokens ?? CHUNK_OVERLAP_TOKENS;
  const pieces = paragraphs.flatMap((p) => splitLong(p, Math.min(MAX_PARAGRAPH_CHARS, target * 4)));

  const groups: string[][] = [];
  let current: string[] = [];
  let currentTokens = 0;
  for (const piece of pieces) {
    const tokens = approxTokens(piece);
    if (current.length > 0 && currentTokens + tokens > target) {
      groups.push(current);
      // Carry the tail of the previous chunk forward, up to the overlap budget.
      const carried: string[] = [];
      let carriedTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = approxTokens(current[i]);
        if (carriedTokens + t > overlap) break;
        carried.unshift(current[i]);
        carriedTokens += t;
      }
      current = carried;
      currentTokens = carriedTokens;
    }
    current.push(piece);
    currentTokens += tokens;
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, position) => {
    const content = `${breadcrumb}\n\n${group.join("\n\n")}`;
    return { position, content, tokenCount: approxTokens(content), contentHash: sha256(content) };
  });
}

export function breadcrumb(...parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" › ");
}
