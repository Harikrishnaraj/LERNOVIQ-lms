import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { MAX_QUERY_CHARS } from "./retrieval";

// Admin Knowledge Base reads (T-223, F-802). Every function runs on the admin's own session: the
// admin_* database functions check `knowledge.manage` themselves, because the knowledge tables
// grant clients nothing (T-220).

export const KNOWLEDGE_PAGE_SIZE = 50;

export const SOURCE_STATUSES = ["pending", "processing", "ready", "failed"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];
export const SOURCE_KINDS = ["lesson", "document"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface KnowledgeSourceRow {
  id: string;
  kind: "lesson" | "lesson_asset" | "document";
  title: string;
  status: SourceStatus;
  error: string | null;
  chunkCount: number;
  scope:
    | { type: "course"; courseId: string | null; title: string; version: number | null }
    | { type: "organization"; organizationId: string; name: string }
    | { type: "platform" };
  lessonId: string | null;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  attempts: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeFilters {
  status?: SourceStatus | null;
  kind?: SourceKind | null;
  q?: string;
  page?: number;
}

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: "permission" | "failed" };

interface SourceDbRow {
  id: string;
  kind: KnowledgeSourceRow["kind"];
  title: string;
  status: SourceStatus;
  error: string | null;
  chunk_count: number;
  course_version_id: string | null;
  course_id: string | null;
  course_title: string | null;
  version_number: number | null;
  organization_id: string | null;
  organization_name: string | null;
  lesson_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  byte_size: number | null;
  attempts: number | null;
  created_at: string;
  updated_at: string;
  total: number;
}

const isPermissionError = (e: { code?: string }) => e.code === "42501";

export function toSourceRow(r: SourceDbRow): KnowledgeSourceRow {
  const scope: KnowledgeSourceRow["scope"] = r.course_version_id
    ? {
        type: "course",
        courseId: r.course_id,
        title: r.course_title ?? "Course",
        version: r.version_number,
      }
    : r.organization_id
      ? {
          type: "organization",
          organizationId: r.organization_id,
          name: r.organization_name ?? "Organization",
        }
      : { type: "platform" };
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    status: r.status,
    error: r.error,
    chunkCount: r.chunk_count,
    scope,
    lessonId: r.lesson_id,
    fileName: r.file_name,
    mimeType: r.mime_type,
    byteSize: r.byte_size === null ? null : Number(r.byte_size),
    attempts: r.attempts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listKnowledgeSources(
  supabase: SupabaseClient,
  filters: KnowledgeFilters,
): Promise<Loaded<{ sources: KnowledgeSourceRow[]; total: number }>> {
  const page = Math.max(1, Math.trunc(filters.page ?? 1));
  const { data, error } = await supabase.rpc("admin_list_knowledge_sources", {
    p_status: filters.status ?? null,
    p_kind: filters.kind ?? null,
    p_search: filters.q?.trim() || null,
    p_limit: KNOWLEDGE_PAGE_SIZE,
    p_offset: (page - 1) * KNOWLEDGE_PAGE_SIZE,
  });
  if (error) {
    if (isPermissionError(error)) return { ok: false, error: "permission" };
    log.error("knowledge.admin.list_failed", { message: error.message });
    return { ok: false, error: "failed" };
  }
  const rows = (data ?? []) as SourceDbRow[];
  return {
    ok: true,
    data: { sources: rows.map(toSourceRow), total: rows.length ? Number(rows[0].total) : 0 },
  };
}

export type StatusCounts = Record<SourceStatus, number> & { documents: number; lessons: number };

export async function getKnowledgeStatusCounts(
  supabase: SupabaseClient,
): Promise<Loaded<StatusCounts>> {
  const { data, error } = await supabase.rpc("admin_knowledge_status_counts");
  if (error) {
    if (isPermissionError(error)) return { ok: false, error: "permission" };
    log.error("knowledge.admin.counts_failed", { message: error.message });
    return { ok: false, error: "failed" };
  }
  const counts: StatusCounts = {
    pending: 0,
    processing: 0,
    ready: 0,
    failed: 0,
    documents: 0,
    lessons: 0,
  };
  for (const row of (data ?? []) as { kind: string; status: SourceStatus; n: number }[]) {
    const n = Number(row.n);
    if (row.status in counts) counts[row.status] += n;
    if (row.kind === "document") counts.documents += n;
    else if (row.kind === "lesson") counts.lessons += n;
  }
  return { ok: true, data: counts };
}

export interface ScopeOption {
  id: string;
  name: string;
}

/** Organizations the admin can see (RLS: organizations.manage, or their own), for scope pickers. */
export async function listScopeOrganizations(supabase: SupabaseClient): Promise<ScopeOption[]> {
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name")
    .limit(500);
  if (error) log.error("knowledge.admin.orgs_failed", { message: error.message });
  return ((data ?? []) as ScopeOption[]).map((o) => ({ id: o.id, name: o.name }));
}

/** Published courses (RLS: course.read_all), for narrowing test retrieval to one course. */
export async function listTestCourses(supabase: SupabaseClient): Promise<ScopeOption[]> {
  const { data, error } = await supabase
    .from("courses")
    .select("id, published_version:course_versions!courses_published_version_fk(title)")
    .not("published_version_id", "is", null)
    .limit(500);
  if (error) log.error("knowledge.admin.courses_failed", { message: error.message });
  return ((data ?? []) as unknown as { id: string; published_version: { title: string } | null }[])
    .map((c) => ({ id: c.id, name: c.published_version?.title ?? "Untitled course" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface TestPassage {
  chunkId: string;
  sourceId: string;
  kind: string;
  lessonId: string | null;
  scope: "course" | "organization" | "platform";
  title: string;
  content: string;
  rank: number;
}

/**
 * Test retrieval (T-223): the ranked passages for a query across every course and organization,
 * optionally narrowed to one course and/or one organization's documents.
 */
export async function testKnowledgeRetrieval(
  supabase: SupabaseClient,
  query: string,
  options: { courseId?: string | null; organizationId?: string | null; limit?: number } = {},
): Promise<Loaded<TestPassage[]>> {
  const text = query.trim().slice(0, MAX_QUERY_CHARS);
  if (!text) return { ok: true, data: [] };
  const { data, error } = await supabase.rpc("admin_match_knowledge_chunks", {
    p_query: text,
    p_course_id: options.courseId ?? null,
    p_organization_id: options.organizationId ?? null,
    p_limit: options.limit ?? 10,
  });
  if (error) {
    if (isPermissionError(error)) return { ok: false, error: "permission" };
    log.error("knowledge.admin.test_failed", { message: error.message });
    return { ok: false, error: "failed" };
  }
  return {
    ok: true,
    data: (
      (data ?? []) as {
        chunk_id: string;
        source_id: string;
        kind: string;
        lesson_id: string | null;
        course_version_id: string | null;
        organization_id: string | null;
        title: string;
        content: string;
        rank: number;
      }[]
    ).map((r) => ({
      chunkId: r.chunk_id,
      sourceId: r.source_id,
      kind: r.kind,
      lessonId: r.lesson_id,
      scope: r.course_version_id ? "course" : r.organization_id ? "organization" : "platform",
      title: r.title,
      content: r.content,
      rank: Number(r.rank),
    })),
  };
}
