import JSZip from "jszip";
import type { DocumentFormat } from "./document-rules";
import { decodeEntities, markdownToParagraphs, textToParagraphs } from "./text";

// Text extraction for uploaded knowledge base documents (T-221, F-800, RAG_PLAN §4). Server-only
// (the indexing worker). Files are parsed as data, never rendered or executed: PDFs through
// pdf.js (via unpdf, which has no eval path), DOCX by reading word/document.xml out of the ZIP
// container with a size cap, TXT/Markdown as strict UTF-8.

/** Extracted text beyond this is dropped, so one huge document cannot swamp the index. */
export const MAX_EXTRACTED_CHARS = 300_000;
/** A DOCX whose main XML part inflates beyond this is refused (ZIP bomb guard). */
export const MAX_DOCX_XML_BYTES = 40 * 1024 * 1024;

/**
 * An extraction failure. `permanent` failures (a damaged, encrypted or image-only file) will fail
 * the same way on every attempt, so the source is marked failed at once instead of retried.
 */
export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export const NO_TEXT_MESSAGE =
  "No readable text was found in this document. Scanned PDFs (pictures of pages) are not supported; upload a file with selectable text.";

export interface ExtractedText {
  paragraphs: string[];
  /** Whether text past MAX_EXTRACTED_CHARS was dropped. */
  truncated: boolean;
}

/** Extracts plain-text paragraphs from a document. Throws ExtractionError. */
export async function extractDocumentText(
  bytes: Uint8Array,
  format: DocumentFormat,
): Promise<ExtractedText> {
  let paragraphs: string[];
  if (format === "pdf") paragraphs = await extractPdf(bytes);
  else if (format === "docx") paragraphs = await extractDocx(bytes);
  else {
    const text = decodeUtf8(bytes);
    paragraphs = format === "md" ? markdownToParagraphs(text) : textToParagraphs(text);
  }

  const capped = capParagraphs(paragraphs, MAX_EXTRACTED_CHARS);
  if (capped.paragraphs.length === 0) throw new ExtractionError(NO_TEXT_MESSAGE, true);
  return capped;
}

export function capParagraphs(paragraphs: string[], maxChars: number): ExtractedText {
  const out: string[] = [];
  let total = 0;
  for (const p of paragraphs) {
    if (total + p.length > maxChars) {
      const room = maxChars - total;
      if (room > 0) out.push(p.slice(0, room).trim());
      return { paragraphs: out.filter(Boolean), truncated: true };
    }
    out.push(p);
    total += p.length;
  }
  return { paragraphs: out, truncated: false };
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new ExtractionError("The file is not valid UTF-8 text.", true);
  }
}

async function extractPdf(bytes: Uint8Array): Promise<string[]> {
  // Imported lazily: pdf.js is large and only the worker needs it.
  const { extractText, getDocumentProxy } = await import("unpdf");
  let pages: string[];
  try {
    // pdf.js may take ownership of (detach) the buffer it is given, so hand it a copy. The
    // pdf.js build in unpdf has no eval code path (no `isEvalSupported` option to turn off).
    const pdf = await getDocumentProxy(bytes.slice(), { useSystemFonts: false, verbosity: 0 });
    try {
      pages = (await extractText(pdf, { mergePages: false })).text;
    } finally {
      await pdf.cleanup().catch(() => {});
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "PasswordException") {
      throw new ExtractionError(
        "This PDF is password-protected. Upload an unprotected copy.",
        true,
      );
    }
    throw new ExtractionError(
      "This PDF could not be read. It may be damaged; try exporting it again.",
      true,
    );
  }
  return pages.flatMap((page) =>
    textToParagraphs(page)
      // PDF lines are hard-wrapped: re-join hyphenated words and wrapped lines.
      .map((p) =>
        p
          .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
          .replace(/\n/g, " ")
          .trim(),
      )
      .filter(Boolean),
  );
}

async function extractDocx(bytes: Uint8Array): Promise<string[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new ExtractionError(
      "This Word document could not be read. It may be damaged; try saving it again as .docx.",
      true,
    );
  }
  const entry = zip.file("word/document.xml");
  if (!entry) {
    throw new ExtractionError("This file is not a Word (.docx) document.", true);
  }
  const xml = await readCapped(entry, MAX_DOCX_XML_BYTES);
  return docxXmlToParagraphs(xml);
}

/** Inflates one ZIP entry, giving up once it grows past `maxBytes`. */
function readCapped(entry: JSZip.JSZipObject, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    let done = false;
    const stream = entry.nodeStream("nodebuffer");
    const fail = (err: ExtractionError) => {
      if (done) return;
      done = true;
      (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
      reject(err);
    };
    stream.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        fail(new ExtractionError("This Word document is too large to index.", true));
        return;
      }
      parts.push(chunk);
    });
    stream.on("error", () =>
      fail(
        new ExtractionError(
          "This Word document could not be read. It may be damaged; try saving it again as .docx.",
          true,
        ),
      ),
    );
    stream.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(parts).toString("utf8"));
    });
  });
}

/**
 * word/document.xml to paragraphs: each <w:p> is a paragraph, its <w:t> runs are its text, tabs
 * and breaks become whitespace. Paragraph properties (tab stops) and deleted or field-code text
 * (<w:delText>, <w:instrText>) are ignored.
 */
export function docxXmlToParagraphs(xml: string): string[] {
  const body = xml
    .replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/g, "")
    // Text boxes are stored twice (modern + fallback markup); keep one copy.
    .replace(/<mc:Fallback\b[\s\S]*?<\/mc:Fallback>/g, "");
  const paragraphs: string[] = [];
  for (const match of body.matchAll(/<w:p\b[^>]*?(?:\/>|>([\s\S]*?)<\/w:p>)/g)) {
    const inner = match[1] ?? "";
    let text = "";
    for (const token of inner.matchAll(
      /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>/g,
    )) {
      if (token[1] !== undefined) text += decodeEntities(token[1]);
      else if (token[0].startsWith("<w:tab")) text += "\t";
      else text += "\n";
    }
    const cleaned = text
      .replace(/[ \t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
    if (cleaned) paragraphs.push(cleaned);
  }
  return paragraphs;
}
