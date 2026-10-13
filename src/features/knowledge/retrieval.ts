import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";

// Permission-aware retrieval for the AI Tutor (T-222, F-801, ADR-017, SECURITY §16). Always runs
// with the caller's own session: match_knowledge_chunks scopes results to what auth.uid() may
// read before ranking. Never call this with the service-role client - that would search as nobody
// and return nothing, and must never be "fixed" by widening the SQL.

export const MAX_QUERY_CHARS = 500;
export const DEFAULT_PASSAGES = 8;
export const MAX_PASSAGES = 20;

export interface RetrievedPassage {
  chunkId: string;
  sourceId: string;
  /** Set for lesson passages: the citation links to this lesson. */
  lessonId: string | null;
  courseVersionId: string | null;
  organizationId: string | null;
  /** Source title (lesson or document name). */
  title: string;
  content: string;
  rank: number;
}

export type RetrievalResult =
  { ok: true; passages: RetrievedPassage[] } | { ok: false; error: "search_failed" };

interface Row {
  chunk_id: string;
  source_id: string;
  lesson_id: string | null;
  course_version_id: string | null;
  organization_id: string | null;
  title: string;
  content: string;
  rank: number;
}

/** Finds passages the signed-in user may read that match the question. Never throws. */
export async function searchKnowledge(
  supabase: SupabaseClient,
  query: string,
  options: { courseId?: string | null; limit?: number } = {},
): Promise<RetrievalResult> {
  const text = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!text) return { ok: true, passages: [] };
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? DEFAULT_PASSAGES), 1), MAX_PASSAGES);

  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    p_query: text,
    p_course_id: options.courseId ?? null,
    p_limit: limit,
  });
  if (error) {
    log.error("knowledge.search_failed", { message: error.message });
    return { ok: false, error: "search_failed" };
  }
  return {
    ok: true,
    passages: ((data ?? []) as Row[]).map((r) => ({
      chunkId: r.chunk_id,
      sourceId: r.source_id,
      lessonId: r.lesson_id,
      courseVersionId: r.course_version_id,
      organizationId: r.organization_id,
      title: r.title,
      content: r.content,
      rank: Number(r.rank),
    })),
  };
}
