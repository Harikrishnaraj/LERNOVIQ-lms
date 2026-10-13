// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_PASSAGES, MAX_QUERY_CHARS, searchKnowledge } from "@/features/knowledge/retrieval";

// F-801 (T-222): the retrieval service passes the question to the permission-scoped SQL function.

function client(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<typeof result>>(
    async () => result,
  );
  return { supabase: { rpc } as unknown as SupabaseClient, rpc };
}

const row = {
  chunk_id: "c1",
  source_id: "s1",
  lesson_id: "l1",
  course_version_id: "v1",
  organization_id: null,
  title: "Closures",
  content: "JS › Functions › Closures\n\nA closure captures variables.",
  rank: "0.5",
};

describe("searchKnowledge", () => {
  it("calls match_knowledge_chunks with the trimmed question, course and limit, and maps rows", async () => {
    const { supabase, rpc } = client({ data: [row], error: null });
    const result = await searchKnowledge(supabase, "  what is a closure?  ", {
      courseId: "course-1",
      limit: 5,
    });

    expect(rpc).toHaveBeenCalledWith("match_knowledge_chunks", {
      p_query: "what is a closure?",
      p_course_id: "course-1",
      p_limit: 5,
    });
    expect(result).toEqual({
      ok: true,
      passages: [
        {
          chunkId: "c1",
          sourceId: "s1",
          lessonId: "l1",
          courseVersionId: "v1",
          organizationId: null,
          title: "Closures",
          content: row.content,
          rank: 0.5,
        },
      ],
    });
  });

  it("does not search for an empty question", async () => {
    const { supabase, rpc } = client({ data: [], error: null });
    expect(await searchKnowledge(supabase, "   ")).toEqual({ ok: true, passages: [] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("caps the question length and clamps the limit", async () => {
    const { supabase, rpc } = client({ data: [], error: null });
    await searchKnowledge(supabase, "x".repeat(MAX_QUERY_CHARS + 50), { limit: 500 });
    await searchKnowledge(supabase, "closures", { limit: 0 });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: MAX_PASSAGES, p_course_id: null });
    expect(String(rpc.mock.calls[0][1].p_query)).toHaveLength(MAX_QUERY_CHARS);
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_limit: 1 });
  });

  it("returns a recoverable error instead of throwing when the search fails", async () => {
    const { supabase } = client({ data: null, error: { message: "boom" } });
    expect(await searchKnowledge(supabase, "closures")).toEqual({
      ok: false,
      error: "search_failed",
    });
  });
});
