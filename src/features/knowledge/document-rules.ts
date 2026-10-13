// Upload rules for knowledge base documents (T-221, F-800, SECURITY §9). Pure and client-safe:
// the upload form uses the same constants for its `accept` list and size hint, and the server
// actions re-check everything (the browser's report is never trusted on its own).

export type DocumentFormat = "pdf" | "docx" | "txt" | "md";

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_TITLE = 300;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The MIME type each format is stored under (the bucket allows exactly these). */
export const DOCUMENT_MIME: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  docx: DOCX_MIME,
  txt: "text/plain",
  md: "text/markdown",
};

const EXTENSIONS: Record<string, DocumentFormat> = {
  pdf: "pdf",
  docx: "docx",
  txt: "txt",
  md: "md",
  markdown: "md",
};

/**
 * Browser-reported MIME types accepted for each format. Browsers report Markdown (and sometimes
 * text) inconsistently, so an empty or generic type is accepted for the text formats; the bytes
 * are checked after the upload either way (`sniffDocument`).
 */
const REPORTED_TYPES: Record<DocumentFormat, readonly string[]> = {
  pdf: ["application/pdf"],
  docx: [DOCX_MIME],
  txt: ["text/plain", "", "application/octet-stream"],
  md: ["text/markdown", "text/x-markdown", "text/plain", "", "application/octet-stream"],
};

export const DOCUMENT_ACCEPT = ".pdf,.docx,.txt,.md,.markdown";
export const DOCUMENT_TYPES_LABEL = "PDF, Word (.docx), plain text (.txt) or Markdown (.md)";

export function formatFromMime(mime: string | null | undefined): DocumentFormat | null {
  const hit = (Object.entries(DOCUMENT_MIME) as [DocumentFormat, string][]).find(
    ([, m]) => m === mime,
  );
  return hit ? hit[0] : null;
}

export interface DocumentFile {
  name: unknown;
  size: unknown;
  type: unknown;
}

export type DocumentCheck =
  | { ok: true; format: DocumentFormat; mimeType: string; fileName: string }
  | { ok: false; error: string };

/** A file name with no path parts or control characters, capped in length. */
export function safeDocumentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, 200) || "document";
}

/** Checks name/extension, reported MIME type and size before anything is uploaded. */
export function validateDocumentFile(file: DocumentFile): DocumentCheck {
  if (typeof file.name !== "string" || file.name.trim() === "") {
    return { ok: false, error: "Choose a file." };
  }
  const fileName = safeDocumentName(file.name);
  const dot = fileName.lastIndexOf(".");
  const format = dot === -1 ? undefined : EXTENSIONS[fileName.slice(dot + 1).toLowerCase()];
  if (!format) {
    return { ok: false, error: `That file type is not supported. Use ${DOCUMENT_TYPES_LABEL}.` };
  }
  const reported = typeof file.type === "string" ? file.type.toLowerCase() : "";
  if (!REPORTED_TYPES[format].includes(reported)) {
    return {
      ok: false,
      error: `The file's type does not match its .${fileName.slice(dot + 1).toLowerCase()} extension.`,
    };
  }
  if (typeof file.size !== "number" || !Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, error: "The file is empty." };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: "The file must be 10 MB or smaller." };
  }
  return { ok: true, format, mimeType: DOCUMENT_MIME[format], fileName };
}

/** Title shown for the document: the given title, or the file name without its extension. */
export function documentTitle(title: unknown, fileName: string): string | null {
  const given = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  const fallback = fileName.replace(/\.[^.]+$/, "").trim() || fileName;
  const value = given || fallback;
  return value.length >= 1 && value.length <= MAX_DOCUMENT_TITLE ? value : null;
}

/** How many leading bytes `sniffDocument` needs. */
export const SNIFF_BYTES = 1024;

/**
 * Checks the file's first bytes against its format, so a renamed file is rejected: PDF starts
 * with "%PDF-", DOCX is a ZIP container ("PK\x03\x04"), and TXT/Markdown must be UTF-8 text
 * with no NUL bytes (a binary file renamed to .txt fails here).
 */
export function sniffDocument(head: Uint8Array, format: DocumentFormat): boolean {
  if (head.length === 0) return false;
  if (format === "pdf") {
    // The PDF header may follow a little leading junk; real readers search the first 1 KB.
    const text = latin1(head.subarray(0, SNIFF_BYTES));
    return text.includes("%PDF-");
  }
  if (format === "docx") {
    return (
      head.length >= 4 &&
      head[0] === 0x50 &&
      head[1] === 0x4b &&
      head[2] === 0x03 &&
      head[3] === 0x04
    );
  }
  const sample = head.subarray(0, SNIFF_BYTES);
  if (sample.includes(0)) return false;
  try {
    // `stream: true` tolerates a multi-byte character cut off at the end of the sample.
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: true });
    return true;
  } catch {
    return false;
  }
}

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/** Storage path of an upload: "<organization id | platform>/<random uuid>.<format>". */
export function documentStoragePath(
  organizationId: string | null,
  id: string,
  format: DocumentFormat,
) {
  return `${organizationId ?? "platform"}/${id}.${format}`;
}

/** Whether `path` is a path `documentStoragePath` issues for this scope and format. */
export function isDocumentStoragePath(
  path: unknown,
  organizationId: string | null,
  format: DocumentFormat,
): path is string {
  if (typeof path !== "string") return false;
  const prefix = `${organizationId ?? "platform"}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  const suffix = `.${format}`;
  return rest.endsWith(suffix) && isUuid(rest.slice(0, -suffix.length));
}
