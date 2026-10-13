// @vitest-environment node
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  ExtractionError,
  MAX_EXTRACTED_CHARS,
  NO_TEXT_MESSAGE,
  capParagraphs,
  cleanText,
  docxXmlToParagraphs,
  extractDocumentText,
} from "@/features/knowledge/extract";
import { bytes, makeBlankPdf, makeDocx, makePdf } from "../support/documents";

// F-800 (T-221): text extraction per document type, with fixtures generated here.

async function failure(promise: Promise<unknown>): Promise<ExtractionError> {
  try {
    await promise;
  } catch (err) {
    return err as ExtractionError;
  }
  throw new Error("expected extraction to fail");
}

describe("extractDocumentText", () => {
  it("reads plain text as paragraphs", async () => {
    const out = await extractDocumentText(
      bytes("Refunds take 5 days.\r\n\r\nContact billing for help.\n"),
      "txt",
    );
    expect(out.paragraphs).toEqual(["Refunds take 5 days.", "Contact billing for help."]);
    expect(out.truncated).toBe(false);
  });

  it("strips Markdown syntax but keeps the words", async () => {
    const out = await extractDocumentText(
      bytes("# Onboarding\n\nRead the **handbook** and [open the portal](https://x.test/p).\n"),
      "md",
    );
    expect(out.paragraphs).toEqual(["Onboarding", "Read the handbook and open the portal."]);
  });

  it("extracts text from every page of a PDF", async () => {
    const pdf = makePdf([
      ["Leave policy", "Employees get 25 days."],
      ["Second page about travel."],
    ]);
    const out = await extractDocumentText(pdf, "pdf");
    const text = out.paragraphs.join(" ");
    expect(text).toContain("Leave policy");
    expect(text).toContain("Employees get 25 days.");
    expect(text).toContain("Second page about travel.");
  });

  it("extracts the paragraphs of a DOCX", async () => {
    const docx = await makeDocx(["Security basics", "Use a password manager & enable MFA."]);
    const out = await extractDocumentText(docx, "docx");
    expect(out.paragraphs).toEqual(["Security basics", "Use a password manager & enable MFA."]);
  });

  it("fails permanently, with a readable message, for a corrupt PDF", async () => {
    const err = await failure(extractDocumentText(bytes("%PDF-1.4 this is not a pdf"), "pdf"));
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.permanent).toBe(true);
    expect(err.message).toMatch(/could not be read/i);
  });

  it("fails permanently for a PDF with no selectable text", async () => {
    const err = await failure(extractDocumentText(makeBlankPdf(), "pdf"));
    expect(err.permanent).toBe(true);
    expect(err.message).toBe(NO_TEXT_MESSAGE);
  });

  it("fails permanently for a corrupt DOCX and for a ZIP that is not a Word document", async () => {
    const corrupt = await failure(extractDocumentText(bytes("PK\x03\x04 garbage"), "docx"));
    expect(corrupt.permanent).toBe(true);
    expect(corrupt.message).toMatch(/could not be read/i);

    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    const notWord = await failure(
      extractDocumentText(await zip.generateAsync({ type: "uint8array" }), "docx"),
    );
    expect(notWord.message).toMatch(/not a Word/i);
  });

  it("fails permanently for an empty text file and for invalid UTF-8", async () => {
    expect((await failure(extractDocumentText(bytes("  \n\n "), "txt"))).message).toBe(
      NO_TEXT_MESSAGE,
    );
    const bad = await failure(extractDocumentText(new Uint8Array([0x66, 0xff, 0xfe, 0x6f]), "txt"));
    expect(bad.permanent).toBe(true);
    expect(bad.message).toMatch(/UTF-8/);
  });

  it("drops NUL characters and lone surrogates that Postgres or JSON would reject", async () => {
    const out = await extractDocumentText(
      bytes("Pay\u0000roll runs monthly.\n\n\u0000\u0000"),
      "txt",
    );
    expect(out.paragraphs).toEqual(["Payroll runs monthly."]);
    expect(cleanText("a\ud800b")).toBe("ab");
  });

  it("caps very long text", async () => {
    const paragraph = "word ".repeat(1000).trim();
    const text = Array.from({ length: 400 }, () => paragraph).join("\n\n");
    const out = await extractDocumentText(bytes(text), "txt");
    expect(out.truncated).toBe(true);
    expect(out.paragraphs.join("").length).toBeLessThanOrEqual(MAX_EXTRACTED_CHARS);
  });
});

describe("capParagraphs", () => {
  it("keeps everything under the cap and trims the paragraph that crosses it", () => {
    expect(capParagraphs(["aaa", "bbb"], 10)).toEqual({
      paragraphs: ["aaa", "bbb"],
      truncated: false,
    });
    expect(capParagraphs(["aaaa", "bbbbbb", "cc"], 6)).toEqual({
      paragraphs: ["aaaa", "bb"],
      truncated: true,
    });
  });
});

describe("docxXmlToParagraphs", () => {
  it("joins runs, turns tabs and breaks into whitespace and ignores deleted text and field codes", () => {
    const xml =
      '<w:body><w:p><w:pPr><w:tabs><w:tab w:val="left"/></w:tabs></w:pPr><w:r><w:t>Hello</w:t></w:r><w:r><w:tab/><w:t xml:space="preserve"> wor</w:t></w:r><w:r><w:t>ld</w:t></w:r></w:p>' +
      "<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del><w:r><w:instrText>PAGE</w:instrText></w:r></w:p><w:p/></w:body>";
    expect(docxXmlToParagraphs(xml)).toEqual(["Hello world", "Line one\nLine two"]);
  });
});
