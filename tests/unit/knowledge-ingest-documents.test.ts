// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_ATTEMPTS, processJob } from "@/features/knowledge/ingest";
import { MAX_EXTRACTED_CHARS, NO_TEXT_MESSAGE } from "@/features/knowledge/extract";
import { createFakeEmbeddingProvider } from "@/services/embeddings/fake";
import type { EmbeddingProvider } from "@/services/embeddings";
import { bytes, makeBlankPdf, makeDocx, makePdf } from "../support/documents";

// F-800 (T-221): the worker's document path - download from private storage, extract, chunk,
// complete the job - with the database and storage replaced by stubs.

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const job = { job_id: "job-1", source_id: "src-1", attempts: 1 };

const keywordOnly: EmbeddingProvider = {
  name: "openai",
  model: "text-embedding-3-small",
  embed: async () => ({
    ok: false,
    provider: "openai",
    model: "m",
    reason: "not_configured",
    code: "missing_api_key",
  }),
};

interface Stub {
  title?: string;
  mime: string | null;
  path?: string | null;
  contentHash?: string | null;
  file?: Uint8Array | null;
  downloadError?: string;
  failResult?: "failed" | "retrying";
}

function stub(state: Stub) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "fail_knowledge_job") return { data: state.failResult ?? "failed", error: null };
    if (name === "complete_knowledge_job") return { data: null, error: null };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  const download = vi.fn(async () =>
    state.downloadError
      ? { data: null, error: { message: state.downloadError } }
      : {
          data: { arrayBuffer: async () => (state.file ?? new Uint8Array()).slice().buffer },
          error: null,
        },
  );
  const storageFrom = vi.fn(() => ({ download }));
  const db = {
    rpc,
    storage: { from: storageFrom },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              kind: "document",
              lesson_id: null,
              content_hash: state.contentHash ?? null,
              title: state.title ?? "Leave policy",
              storage_path: state.path === undefined ? "platform/x.pdf" : state.path,
              mime_type: state.mime,
            },
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, rpc, download, storageFrom };
}

const call = (rpc: ReturnType<typeof vi.fn>, name: string) =>
  rpc.mock.calls.find(([n]) => n === name)?.[1] as Record<string, unknown> | undefined;

describe("processJob for uploaded documents", () => {
  it("indexes a TXT document with its title as the breadcrumb", async () => {
    const s = stub({
      mime: "text/plain",
      path: "platform/a.txt",
      file: bytes("Refunds take five days.\n\nAsk billing for details."),
    });
    expect(await processJob(s.db, keywordOnly, job)).toBe("succeeded");
    expect(s.storageFrom).toHaveBeenCalledWith("knowledge-documents");
    expect(s.download).toHaveBeenCalledWith("platform/a.txt");
    const chunks = call(s.rpc, "complete_knowledge_job")!.p_chunks as {
      position: number;
      content: string;
      embedding: unknown;
    }[];
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      position: 0,
      content: "Leave policy\n\nRefunds take five days.\n\nAsk billing for details.",
      embedding: null,
    });
  });

  it("extracts PDFs and DOCX files and stores embeddings when a provider is configured", async () => {
    const pdf = stub({
      mime: "application/pdf",
      file: makePdf([["Remote work policy", "Work from anywhere."]]),
    });
    expect(await processJob(pdf.db, createFakeEmbeddingProvider(), job)).toBe("succeeded");
    const pdfChunks = call(pdf.rpc, "complete_knowledge_job")!.p_chunks as {
      content: string;
      embedding_model: string;
    }[];
    expect(pdfChunks[0].content).toContain("Remote work policy");
    expect(pdfChunks[0].embedding_model).toBe("fake-embed-1");

    const docx = stub({ mime: DOCX, file: await makeDocx(["Expenses must be filed monthly."]) });
    expect(await processJob(docx.db, keywordOnly, job)).toBe("succeeded");
    const docxChunks = call(docx.rpc, "complete_knowledge_job")!.p_chunks as { content: string }[];
    expect(docxChunks[0].content).toContain("Expenses must be filed monthly.");
  });

  it("splits a long document into several chunks with consecutive positions", async () => {
    const paragraphs = Array.from(
      { length: 40 },
      (_, i) => `Paragraph ${i}: ${"detail ".repeat(60)}`,
    );
    const s = stub({ mime: "text/plain", file: bytes(paragraphs.join("\n\n")) });
    expect(await processJob(s.db, keywordOnly, job)).toBe("succeeded");
    const chunks = call(s.rpc, "complete_knowledge_job")!.p_chunks as {
      position: number;
      content: string;
    }[];
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.map((c) => c.position)).toEqual(chunks.map((_, i) => i));
    expect(chunks.every((c) => c.content.startsWith("Leave policy\n\n"))).toBe(true);
  });

  it("caps the extracted text", async () => {
    const text = Array.from({ length: 400 }, () => "word ".repeat(1000).trim()).join("\n\n");
    const s = stub({ mime: "text/plain", file: bytes(text) });
    expect(await processJob(s.db, keywordOnly, job)).toBe("succeeded");
    const chunks = call(s.rpc, "complete_knowledge_job")!.p_chunks as { content: string }[];
    const body = chunks.reduce((n, c) => n + c.content.length, 0);
    // Overlap and per-chunk breadcrumbs add some characters, but nowhere near the whole input.
    expect(body).toBeLessThan(MAX_EXTRACTED_CHARS * 1.5);
    expect(body).toBeLessThan(text.length);
  });

  it("keeps the existing chunks when the text is unchanged since the last run", async () => {
    const file = bytes("Same text as before.");
    const first = stub({ mime: "text/plain", file });
    await processJob(first.db, keywordOnly, job);
    const hash = call(first.rpc, "complete_knowledge_job")!.p_content_hash as string;

    const again = stub({ mime: "text/plain", file, contentHash: hash });
    expect(await processJob(again.db, keywordOnly, job)).toBe("unchanged");
    expect(call(again.rpc, "complete_knowledge_job")!.p_chunks).toBeNull();
  });

  it.each([
    [
      "a corrupt PDF",
      { mime: "application/pdf", file: bytes("%PDF-1.4 broken") },
      /could not be read/i,
    ],
    ["a PDF with no text", { mime: "application/pdf", file: makeBlankPdf() }, NO_TEXT_MESSAGE],
    ["a corrupt DOCX", { mime: DOCX, file: bytes("PK\x03\x04 nope") }, /could not be read/i],
    ["an empty text file", { mime: "text/plain", file: bytes("   \n\n  ") }, NO_TEXT_MESSAGE],
    [
      "a binary file renamed to .txt",
      { mime: "text/plain", file: new Uint8Array([0x66, 0xff, 0xfe]) },
      /UTF-8/,
    ],
  ])(
    "marks %s failed at once, with a readable error, without retrying",
    async (_label, state, message) => {
      const s = stub(state as Stub);
      expect(await processJob(s.db, keywordOnly, job)).toBe("failed");
      expect(s.rpc).not.toHaveBeenCalledWith("complete_knowledge_job", expect.anything());
      const args = call(s.rpc, "fail_knowledge_job")!;
      expect(args.p_max_attempts).toBe(1);
      expect(args.p_error).toMatch(message);
    },
  );

  it("fails permanently when the source has no stored file or an unknown type, or the file is gone", async () => {
    for (const state of [
      { mime: "text/plain", path: null },
      { mime: "image/png" },
      { mime: "application/pdf", downloadError: "Object not found" },
    ] as Stub[]) {
      const s = stub(state);
      expect(await processJob(s.db, keywordOnly, job)).toBe("failed");
      expect(call(s.rpc, "fail_knowledge_job")!.p_max_attempts).toBe(1);
    }
  });

  it("retries a storage outage instead of failing the document", async () => {
    const s = stub({
      mime: "application/pdf",
      downloadError: "503 service unavailable",
      failResult: "retrying",
    });
    expect(await processJob(s.db, keywordOnly, job)).toBe("retrying");
    expect(call(s.rpc, "fail_knowledge_job")!.p_max_attempts).toBe(MAX_ATTEMPTS);
  });
});
