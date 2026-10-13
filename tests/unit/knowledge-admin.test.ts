// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KNOWLEDGE_PAGE_SIZE,
  getKnowledgeStatusCounts,
  listKnowledgeSources,
  testKnowledgeRetrieval,
  toSourceRow,
} from "@/features/knowledge/admin";
import { parseKnowledgeQuery } from "@/features/knowledge/admin-query";

// F-802 (T-223): the admin readers call the permission-checking database functions on the
// admin's own session and map their rows; the page's URL state is parsed defensively.

function client(result: { data?: unknown; error?: { code?: string; message: string } | null }) {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

const baseRow = {
  id: "s1",
  kind: "document" as const,
  title: "Leave policy",
  status: "failed" as const,
  error: "No readable text was found",
  chunk_count: 0,
  course_version_id: null,
  course_id: null,
  course_title: null,
  version_number: null,
  organization_id: null,
  organization_name: null,
  lesson_id: null,
  file_name: "leave.pdf",
  mime_type: "application/pdf",
  byte_size: 2048,
  attempts: 1,
  created_at: "2026-10-14T10:00:00Z",
  updated_at: "2026-10-14T10:01:00Z",
  total: 3,
};

describe("toSourceRow", () => {
  it("derives the scope: platform, organization or course version", () => {
    expect(toSourceRow(baseRow).scope).toEqual({ type: "platform" });
    expect(
      toSourceRow({ ...baseRow, organization_id: "o1", organization_name: "Acme" }).scope,
    ).toEqual({
      type: "organization",
      organizationId: "o1",
      name: "Acme",
    });
    expect(
      toSourceRow({
        ...baseRow,
        kind: "lesson",
        course_version_id: "v1",
        course_id: "c1",
        course_title: "JS Basics",
        version_number: 2,
      }).scope,
    ).toEqual({ type: "course", courseId: "c1", title: "JS Basics", version: 2 });
  });

  it("keeps the failure reason and the file details", () => {
    expect(toSourceRow(baseRow)).toMatchObject({
      status: "failed",
      error: "No readable text was found",
      fileName: "leave.pdf",
      byteSize: 2048,
      chunkCount: 0,
    });
  });
});

describe("listKnowledgeSources", () => {
  it("passes the filters and page to the admin function and returns the total", async () => {
    const { supabase, rpc } = client({ data: [baseRow, { ...baseRow, id: "s2" }] });
    const result = await listKnowledgeSources(supabase, {
      status: "failed",
      kind: "document",
      q: " leave ",
      page: 3,
    });
    expect(rpc).toHaveBeenCalledWith("admin_list_knowledge_sources", {
      p_status: "failed",
      p_kind: "document",
      p_search: "leave",
      p_limit: KNOWLEDGE_PAGE_SIZE,
      p_offset: 2 * KNOWLEDGE_PAGE_SIZE,
    });
    expect(result).toMatchObject({ ok: true, data: { total: 3 } });
    expect(result.ok && result.data.sources.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("returns an empty list with a zero total", async () => {
    const { supabase } = client({ data: [] });
    expect(await listKnowledgeSources(supabase, {})).toEqual({
      ok: true,
      data: { sources: [], total: 0 },
    });
  });

  it("separates 'not allowed' from 'failed'", async () => {
    expect(
      await listKnowledgeSources(
        client({ error: { code: "42501", message: "permission denied" } }).supabase,
        {},
      ),
    ).toEqual({
      ok: false,
      error: "permission",
    });
    expect(await listKnowledgeSources(client({ error: { message: "boom" } }).supabase, {})).toEqual(
      {
        ok: false,
        error: "failed",
      },
    );
  });
});

describe("getKnowledgeStatusCounts", () => {
  it("sums statuses and counts documents and lessons", async () => {
    const { supabase } = client({
      data: [
        { kind: "lesson", status: "ready", n: 10 },
        { kind: "lesson", status: "pending", n: "2" },
        { kind: "document", status: "ready", n: 3 },
        { kind: "document", status: "failed", n: 1 },
      ],
    });
    expect(await getKnowledgeStatusCounts(supabase)).toEqual({
      ok: true,
      data: { pending: 2, processing: 0, ready: 13, failed: 1, documents: 4, lessons: 12 },
    });
  });

  it("reports permission errors", async () => {
    expect(
      await getKnowledgeStatusCounts(client({ error: { code: "42501", message: "x" } }).supabase),
    ).toEqual({
      ok: false,
      error: "permission",
    });
  });
});

describe("testKnowledgeRetrieval", () => {
  it("searches through the permission-checked admin function, never the learner one", async () => {
    const { supabase, rpc } = client({
      data: [
        {
          chunk_id: "c1",
          source_id: "s1",
          kind: "document",
          lesson_id: null,
          course_version_id: null,
          organization_id: "o1",
          title: "Leave policy",
          content: "Employees get 25 days.",
          rank: 0.42,
        },
      ],
    });
    const result = await testKnowledgeRetrieval(supabase, "  how many leave days? ", {
      courseId: "c1",
      organizationId: "o1",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_match_knowledge_chunks", {
      p_query: "how many leave days?",
      p_course_id: "c1",
      p_organization_id: "o1",
      p_limit: 10,
    });
    expect(result).toEqual({
      ok: true,
      data: [
        {
          chunkId: "c1",
          sourceId: "s1",
          kind: "document",
          lessonId: null,
          scope: "organization",
          title: "Leave policy",
          content: "Employees get 25 days.",
          rank: 0.42,
        },
      ],
    });
  });

  it("does not call the database for a blank question", async () => {
    const { supabase, rpc } = client({ data: [] });
    expect(await testKnowledgeRetrieval(supabase, "   ")).toEqual({ ok: true, data: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces a permission refusal", async () => {
    const { supabase } = client({ error: { code: "42501", message: "permission denied" } });
    expect(await testKnowledgeRetrieval(supabase, "anything")).toEqual({
      ok: false,
      error: "permission",
    });
  });
});

describe("parseKnowledgeQuery", () => {
  const id = "11111111-2222-4333-8444-555555555555";

  it("accepts known filters and ids", () => {
    expect(
      parseKnowledgeQuery({
        status: "failed",
        kind: "document",
        q: " leave ",
        page: "2",
        tq: " refunds ",
        tc: id,
        to: id,
      }),
    ).toEqual({
      status: "failed",
      kind: "document",
      q: "leave",
      page: 2,
      test: "refunds",
      testCourse: id,
      testOrganization: id,
    });
  });

  it("falls back to defaults for anything unexpected", () => {
    expect(
      parseKnowledgeQuery({
        status: "bogus",
        kind: "lesson_asset",
        page: "-4",
        tc: "x",
        to: ["not", "uuid"],
        q: "a".repeat(300),
        tq: "b".repeat(900),
      }),
    ).toEqual({
      status: "",
      kind: "",
      q: "a".repeat(100),
      page: 1,
      test: "b".repeat(500),
      testCourse: "",
      testOrganization: "",
    });
    expect(parseKnowledgeQuery({}).page).toBe(1);
  });
});
