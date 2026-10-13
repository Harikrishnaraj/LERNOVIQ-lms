// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// F-800 / F-802 (T-221, T-223): every knowledge-base mutation authenticates, requires
// knowledge.manage, validates its input, rate-limits, and is audited; nothing touches the
// service-role client or storage before authorization succeeds.

const m = vi.hoisted(() => ({
  state: {
    user: { id: "admin-1", email: "admin@example.com" } as { id: string; email: string } | null,
    orgExists: true,
    header: new Uint8Array() as Uint8Array,
    headerError: false,
    rpcResult: { data: "00000000-0000-4000-8000-000000000001" as unknown, error: null as unknown },
    deleted: [
      { title: "Policy", storage_path: "platform/x.pdf", organization_id: null },
    ] as unknown[],
    deleteError: null as unknown,
    allowed: true,
  },
  can: vi.fn(),
  audit: vi.fn(),
  rateLimit: vi.fn(),
  createSignedUpload: vi.fn(),
  readHeader: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  adminFrom: vi.fn(),
  deleteChain: { eqs: [] as [string, unknown][] },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/can", () => ({ can: m.can }));
vi.mock("@/services/audit", () => ({ recordAudit: m.audit }));
vi.mock("@/services/rate-limit", () => ({
  rateLimit: m.rateLimit,
  clientIp: async () => "1.2.3.4",
  RATE_LIMITED_MESSAGE: "Too many attempts.",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: m.state.user } }) } }),
}));
vi.mock("@/services/storage", () => ({
  KNOWLEDGE_DOCUMENT_BUCKET: "knowledge-documents",
  supabaseStorage: {
    createSignedUpload: m.createSignedUpload,
    readHeader: m.readHeader,
    remove: m.remove,
  },
}));
vi.mock("@/services/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: m.rpc,
    from: (table: string) => {
      m.adminFrom(table);
      if (table === "organizations") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: m.state.orgExists ? { id: "o" } : null }),
            }),
          }),
        };
      }
      const chain = {
        delete: () => chain,
        eq: (col: string, value: unknown) => {
          m.deleteChain.eqs.push([col, value]);
          return chain;
        },
        select: async () => ({ data: m.state.deleted, error: m.state.deleteError }),
      };
      return chain;
    },
  }),
}));

import {
  deleteKnowledgeDocument,
  registerKnowledgeDocument,
  reindexKnowledgeSource,
  requestKnowledgeUpload,
} from "@/features/knowledge/admin-actions";
import { bytes, makeDocx, makePdf } from "../support/documents";

const ORG = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const SOURCE = "11111111-2222-4333-8444-555555555555";
const FILE_ID = "99999999-8888-4777-8666-555555555555";
const pdfInput = {
  name: "policy.pdf",
  size: 2048,
  type: "application/pdf",
  title: "",
  organizationId: "",
};

beforeEach(() => {
  m.state.user = { id: "admin-1", email: "admin@example.com" };
  m.state.orgExists = true;
  m.state.header = makePdf([["hello"]]);
  m.state.headerError = false;
  m.state.rpcResult = { data: SOURCE, error: null };
  m.state.deleted = [{ title: "Policy", storage_path: "platform/x.pdf", organization_id: null }];
  m.state.deleteError = null;
  m.deleteChain.eqs = [];
  m.can.mockReset().mockResolvedValue(true);
  m.audit.mockReset().mockResolvedValue(true);
  m.rateLimit.mockReset().mockResolvedValue(true);
  m.createSignedUpload.mockReset().mockResolvedValue({ path: "p", token: "tok" });
  m.readHeader.mockReset().mockImplementation(async () => {
    if (m.state.headerError) throw new Error("not found");
    return m.state.header;
  });
  m.remove.mockReset().mockResolvedValue(undefined);
  m.rpc.mockReset().mockImplementation(async () => m.state.rpcResult);
  m.adminFrom.mockReset();
});

function expectNoPrivilegedWork() {
  expect(m.createSignedUpload).not.toHaveBeenCalled();
  expect(m.readHeader).not.toHaveBeenCalled();
  expect(m.remove).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.adminFrom).not.toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
}

describe("authorization (all actions)", () => {
  const calls: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ["requestKnowledgeUpload", () => requestKnowledgeUpload(pdfInput)],
    [
      "registerKnowledgeDocument",
      () => registerKnowledgeDocument({ ...pdfInput, path: `platform/${FILE_ID}.pdf` }),
    ],
    ["reindexKnowledgeSource", () => reindexKnowledgeSource(SOURCE)],
    ["deleteKnowledgeDocument", () => deleteKnowledgeDocument(SOURCE)],
  ];

  it.each(calls)("%s refuses a signed-out caller before doing anything", async (_name, run) => {
    m.state.user = null;
    expect(await run()).toEqual({ ok: false, error: "Please log in again." });
    expect(m.can).not.toHaveBeenCalled();
    expectNoPrivilegedWork();
  });

  it.each(calls)(
    "%s refuses a caller without knowledge.manage before doing anything",
    async (_name, run) => {
      m.can.mockResolvedValue(false);
      const result = await run();
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/permission/i);
      expect(m.can).toHaveBeenCalledWith(expect.anything(), "admin-1", "knowledge.manage");
      expect(m.rateLimit).not.toHaveBeenCalled();
      expectNoPrivilegedWork();
    },
  );
});

describe("requestKnowledgeUpload", () => {
  it("issues a platform-scope ticket under a server-chosen path", async () => {
    const result = await requestKnowledgeUpload(pdfInput);
    expect(result).toMatchObject({
      ok: true,
      bucket: "knowledge-documents",
      token: "tok",
      contentType: "application/pdf",
    });
    const path = (result as { path: string }).path;
    expect(path).toMatch(/^platform\/[0-9a-f-]{36}\.pdf$/);
    expect(m.createSignedUpload).toHaveBeenCalledWith("knowledge-documents", path);
    expect(m.rateLimit).toHaveBeenCalledWith("knowledge-upload", "1.2.3.4", "admin-1");
  });

  it("scopes the path to an existing organization", async () => {
    const result = await requestKnowledgeUpload({ ...pdfInput, organizationId: ORG });
    expect((result as { path: string }).path).toMatch(new RegExp(`^${ORG}/[0-9a-f-]{36}\\.pdf$`));
  });

  it("refuses a malformed or unknown organization", async () => {
    expect(
      await requestKnowledgeUpload({ ...pdfInput, organizationId: "not-a-uuid" }),
    ).toMatchObject({ ok: false });
    m.state.orgExists = false;
    expect(await requestKnowledgeUpload({ ...pdfInput, organizationId: ORG })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/no longer exists/),
    });
    expect(m.createSignedUpload).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: "virus.exe", size: 10, type: "application/octet-stream" }, /not supported/],
    [{ name: "big.pdf", size: 11 * 1024 * 1024, type: "application/pdf" }, /10 MB/],
    [{ name: "empty.pdf", size: 0, type: "application/pdf" }, /empty/],
    [{ name: "liar.pdf", size: 10, type: "text/plain" }, /does not match/],
    [{ name: "a.pdf", size: 10, type: "application/pdf", title: "x".repeat(301) }, /title/],
  ])("rejects invalid input %j before issuing a ticket", async (input, message) => {
    const result = await requestKnowledgeUpload({ ...pdfInput, ...input });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(message) });
    expect(m.createSignedUpload).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    m.rateLimit.mockResolvedValue(false);
    expect(await requestKnowledgeUpload(pdfInput)).toEqual({
      ok: false,
      error: "Too many attempts.",
    });
    expect(m.createSignedUpload).not.toHaveBeenCalled();
  });

  it("reports a storage failure as a retryable error", async () => {
    m.createSignedUpload.mockRejectedValue(new Error("boom"));
    expect(await requestKnowledgeUpload(pdfInput)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/try again/i),
    });
  });
});

describe("registerKnowledgeDocument", () => {
  const path = `platform/${FILE_ID}.pdf`;

  it("creates the pending source and its job, then audits the upload", async () => {
    const result = await registerKnowledgeDocument({ ...pdfInput, title: "  Leave policy ", path });
    expect(result).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("create_document_source", {
      p_title: "Leave policy",
      p_organization_id: null,
      p_storage_path: path,
      p_mime_type: "application/pdf",
      p_byte_size: 2048,
      p_file_name: "policy.pdf",
      p_created_by: "admin-1",
    });
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "knowledge.document_uploaded",
        resourceType: "knowledge_source",
        resourceId: SOURCE,
        metadata: expect.objectContaining({
          title: "Leave policy",
          fileName: "policy.pdf",
          organizationId: null,
        }),
      }),
    );
  });

  it("registers an organization document and a DOCX by its magic bytes", async () => {
    m.state.header = await makeDocx(["hi"]);
    const docxPath = `${ORG}/${FILE_ID}.docx`;
    const result = await registerKnowledgeDocument({
      name: "Handbook.docx",
      size: 4096,
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      title: "",
      organizationId: ORG,
      path: docxPath,
    });
    expect(result).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith(
      "create_document_source",
      expect.objectContaining({
        p_organization_id: ORG,
        p_title: "Handbook",
        p_storage_path: docxPath,
      }),
    );
  });

  it("rejects, and removes, a file whose bytes are not the claimed format", async () => {
    m.state.header = bytes("<html><body>not a pdf</body></html>");
    const result = await registerKnowledgeDocument({ ...pdfInput, path });
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/not a valid PDF/) });
    expect(m.remove).toHaveBeenCalledWith("knowledge-documents", [path]);
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("rejects a binary file renamed to .txt", async () => {
    m.state.header = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const result = await registerKnowledgeDocument({
      name: "notes.txt",
      size: 4,
      type: "text/plain",
      title: "",
      organizationId: "",
      path: `platform/${FILE_ID}.txt`,
    });
    expect(result.ok).toBe(false);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuses a path the server did not issue for this scope and format", async () => {
    for (const bad of [
      `${ORG}/${FILE_ID}.pdf`,
      `platform/${FILE_ID}.docx`,
      "platform/../secret.pdf",
      "other/x.pdf",
      42,
    ]) {
      expect(await registerKnowledgeDocument({ ...pdfInput, path: bad })).toMatchObject({
        ok: false,
      });
    }
    expect(m.readHeader).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("asks for a retry when the upload never arrived", async () => {
    m.state.headerError = true;
    expect(await registerKnowledgeDocument({ ...pdfInput, path })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/did not complete/),
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("reports a database failure without auditing", async () => {
    m.state.rpcResult = { data: null, error: { message: "db down" } };
    expect(await registerKnowledgeDocument({ ...pdfInput, path })).toMatchObject({ ok: false });
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("reindexKnowledgeSource", () => {
  it("requeues the source and audits it", async () => {
    m.state.rpcResult = { data: "queued", error: null };
    expect(await reindexKnowledgeSource(SOURCE)).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("requeue_knowledge_source", { p_source_id: SOURCE });
    expect(m.rateLimit).toHaveBeenCalledWith("knowledge-reindex", "1.2.3.4", "admin-1");
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "knowledge.source_reindexed", resourceId: SOURCE }),
    );
  });

  it("rejects an id that is not a UUID before any database call", async () => {
    for (const id of ["abc", "", null, undefined, 5, "1 or 1=1"]) {
      expect(await reindexKnowledgeSource(id)).toMatchObject({ ok: false });
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("explains a missing source and one that is being indexed right now, without auditing", async () => {
    m.state.rpcResult = { data: "not_found", error: null };
    expect(await reindexKnowledgeSource(SOURCE)).toEqual({ ok: false, error: "Source not found." });
    m.state.rpcResult = { data: "running", error: null };
    expect(await reindexKnowledgeSource(SOURCE)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/being indexed/),
    });
    m.state.rpcResult = { data: null, error: { message: "db" } };
    expect(await reindexKnowledgeSource(SOURCE)).toMatchObject({ ok: false });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    m.rateLimit.mockResolvedValue(false);
    expect(await reindexKnowledgeSource(SOURCE)).toEqual({
      ok: false,
      error: "Too many attempts.",
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("deleteKnowledgeDocument", () => {
  it("deletes only document sources, removes the stored file and audits it", async () => {
    expect(await deleteKnowledgeDocument(SOURCE)).toEqual({ ok: true });
    expect(m.deleteChain.eqs).toEqual([
      ["id", SOURCE],
      ["kind", "document"],
    ]);
    expect(m.remove).toHaveBeenCalledWith("knowledge-documents", ["platform/x.pdf"]);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "knowledge.document_deleted",
        resourceId: SOURCE,
        metadata: { title: "Policy", organizationId: null },
      }),
    );
  });

  it("still succeeds when removing the file fails (the source and its passages are already gone)", async () => {
    m.remove.mockRejectedValue(new Error("storage down"));
    expect(await deleteKnowledgeDocument(SOURCE)).toEqual({ ok: true });
    expect(m.audit).toHaveBeenCalled();
  });

  it("reports a source that does not exist (or is a lesson) and writes no audit row", async () => {
    m.state.deleted = [];
    expect(await deleteKnowledgeDocument(SOURCE)).toEqual({
      ok: false,
      error: "Document not found.",
    });
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("rejects non-UUID ids and reports database errors", async () => {
    expect(await deleteKnowledgeDocument("nope")).toMatchObject({ ok: false });
    expect(m.adminFrom).not.toHaveBeenCalled();
    m.state.deleteError = { message: "db" };
    expect(await deleteKnowledgeDocument(SOURCE)).toMatchObject({ ok: false });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
