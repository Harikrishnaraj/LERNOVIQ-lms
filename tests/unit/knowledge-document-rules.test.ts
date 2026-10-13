// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_BYTES,
  SNIFF_BYTES,
  documentStoragePath,
  documentTitle,
  formatFromMime,
  isDocumentStoragePath,
  isUuid,
  safeDocumentName,
  sniffDocument,
  validateDocumentFile,
} from "@/features/knowledge/document-rules";
import { bytes, makeDocx, makePdf } from "../support/documents";

// F-800 (T-221, SECURITY §9): what may be uploaded to the knowledge base.

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("validateDocumentFile", () => {
  it.each([
    ["policy.pdf", "application/pdf", "pdf", "application/pdf"],
    ["Handbook.DOCX", DOCX, "docx", DOCX],
    ["notes.txt", "text/plain", "txt", "text/plain"],
    ["readme.md", "text/markdown", "md", "text/markdown"],
    ["guide.markdown", "text/x-markdown", "md", "text/markdown"],
    ["notes.txt", "", "txt", "text/plain"],
    ["readme.md", "application/octet-stream", "md", "text/markdown"],
  ])("accepts %s reported as %j", (name, type, format, mimeType) => {
    expect(validateDocumentFile({ name, size: 1234, type })).toEqual({
      ok: true,
      format,
      mimeType,
      fileName: name,
    });
  });

  it.each([
    "virus.exe",
    "page.html",
    "image.png",
    "archive.zip",
    "slides.pptx",
    "noextension",
    ".pdf.",
    "evil.pdf.exe",
  ])("rejects the extension of %s", (name) => {
    const result = validateDocumentFile({ name, size: 10, type: "application/pdf" });
    expect(result.ok).toBe(false);
  });

  it("rejects a reported type that contradicts the extension", () => {
    expect(validateDocumentFile({ name: "a.pdf", size: 10, type: "text/plain" }).ok).toBe(false);
    expect(validateDocumentFile({ name: "a.docx", size: 10, type: "application/pdf" }).ok).toBe(
      false,
    );
    expect(validateDocumentFile({ name: "a.txt", size: 10, type: "text/html" }).ok).toBe(false);
  });

  it("enforces the 10 MB limit exactly and rejects empty or non-numeric sizes", () => {
    const pdf = { name: "a.pdf", type: "application/pdf" };
    expect(validateDocumentFile({ ...pdf, size: MAX_DOCUMENT_BYTES }).ok).toBe(true);
    expect(validateDocumentFile({ ...pdf, size: MAX_DOCUMENT_BYTES + 1 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/10 MB/),
    });
    for (const size of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, "100", null, undefined]) {
      expect(validateDocumentFile({ ...pdf, size }).ok).toBe(false);
    }
  });

  it("rejects missing or non-string names", () => {
    for (const name of ["", "  ", null, 42, undefined]) {
      expect(validateDocumentFile({ name, size: 10, type: "application/pdf" }).ok).toBe(false);
    }
  });

  it("strips path parts and control characters from the file name", () => {
    const result = validateDocumentFile({
      name: "../../etc/pa\u0000th/report.pdf",
      size: 5,
      type: "application/pdf",
    });
    expect(result).toMatchObject({ ok: true, fileName: "report.pdf" });
    expect(safeDocumentName("C:\\Users\\me\\a b.txt")).toBe("a b.txt");
    expect(safeDocumentName("x".repeat(500)).length).toBe(200);
  });
});

describe("documentTitle", () => {
  it("uses the given title, else the file name without its extension", () => {
    expect(documentTitle("  Leave   policy ", "x.pdf")).toBe("Leave policy");
    expect(documentTitle("", "Leave policy.pdf")).toBe("Leave policy");
    expect(documentTitle(undefined, "notes.final.md")).toBe("notes.final");
  });

  it("refuses titles over 300 characters", () => {
    expect(documentTitle("x".repeat(300), "a.pdf")).toBe("x".repeat(300));
    expect(documentTitle("x".repeat(301), "a.pdf")).toBeNull();
  });
});

describe("sniffDocument (magic bytes)", () => {
  it("accepts real PDF and DOCX bytes and UTF-8 text", async () => {
    expect(sniffDocument(makePdf([["hi"]]).subarray(0, SNIFF_BYTES), "pdf")).toBe(true);
    expect(sniffDocument((await makeDocx(["hi"])).subarray(0, SNIFF_BYTES), "docx")).toBe(true);
    expect(sniffDocument(bytes("Plain text with ünïcode ✓"), "txt")).toBe(true);
    expect(sniffDocument(bytes("# Markdown"), "md")).toBe(true);
  });

  it("rejects a file whose bytes do not match its extension", async () => {
    const pdf = makePdf([["hi"]]);
    const docx = await makeDocx(["hi"]);
    expect(sniffDocument(bytes("<html>not a pdf</html>"), "pdf")).toBe(false);
    expect(sniffDocument(docx, "pdf")).toBe(false);
    expect(sniffDocument(pdf, "docx")).toBe(false);
    expect(sniffDocument(bytes("MZ\u0090\u0000 an executable"), "docx")).toBe(false);
    // A binary file renamed to .txt / .md:
    expect(sniffDocument(pdf.subarray(0, 8), "txt")).toBe(true); // ASCII header only
    expect(sniffDocument(new Uint8Array([0x25, 0x50, 0x00, 0x01]), "txt")).toBe(false);
    expect(sniffDocument(docx, "md")).toBe(false);
    expect(sniffDocument(new Uint8Array([0xff, 0xfe, 0x41]), "txt")).toBe(false);
  });

  it("rejects an empty file and tolerates a multi-byte character cut at the end of the sample", () => {
    expect(sniffDocument(new Uint8Array(), "txt")).toBe(false);
    expect(sniffDocument(new Uint8Array(), "pdf")).toBe(false);
    const cut = bytes("abc✓").subarray(0, 4); // the 3-byte check mark is cut after one byte
    expect(sniffDocument(cut, "txt")).toBe(true);
  });
});

describe("storage paths", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const org = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("builds a path per scope and recognizes only its own", () => {
    expect(documentStoragePath(null, id, "pdf")).toBe(`platform/${id}.pdf`);
    expect(documentStoragePath(org, id, "docx")).toBe(`${org}/${id}.docx`);
    expect(isDocumentStoragePath(`platform/${id}.pdf`, null, "pdf")).toBe(true);
    expect(isDocumentStoragePath(`${org}/${id}.docx`, org, "docx")).toBe(true);
  });

  it("refuses another scope, format, traversal or arbitrary object", () => {
    expect(isDocumentStoragePath(`${org}/${id}.pdf`, null, "pdf")).toBe(false);
    expect(isDocumentStoragePath(`platform/${id}.pdf`, org, "pdf")).toBe(false);
    expect(isDocumentStoragePath(`platform/${id}.pdf`, null, "docx")).toBe(false);
    expect(isDocumentStoragePath(`platform/../${id}.pdf`, null, "pdf")).toBe(false);
    expect(isDocumentStoragePath("platform/other-file.pdf", null, "pdf")).toBe(false);
    expect(isDocumentStoragePath(`platform/${id}.pdf/extra`, null, "pdf")).toBe(false);
    expect(isDocumentStoragePath(42, null, "pdf")).toBe(false);
  });
});

describe("helpers", () => {
  it("maps stored MIME types back to formats", () => {
    expect(formatFromMime("application/pdf")).toBe("pdf");
    expect(formatFromMime(DOCX)).toBe("docx");
    expect(formatFromMime("text/markdown")).toBe("md");
    expect(formatFromMime("image/png")).toBeNull();
    expect(formatFromMime(null)).toBeNull();
  });

  it("validates UUIDs", () => {
    expect(isUuid("11111111-2222-4333-8444-555555555555")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});
