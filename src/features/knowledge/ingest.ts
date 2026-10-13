import type { SupabaseClient } from "@supabase/supabase-js";
import type { EmbeddingProvider } from "@/services/embeddings";
import { log } from "@/lib/log";
import { breadcrumb, chunkParagraphs, htmlToParagraphs, sha256, type Chunk } from "./text";

// Lesson indexing worker (T-221, F-800, RAG_PLAN §4). Server-only: runs with the service-role
// client from /api/cron/knowledge-ingest. Search is keyword-first (ADR-042); embeddings are added
// only when an embedding provider is configured.

export const MAX_ATTEMPTS = 3;
const EMBED_BATCH = 64;

interface ClaimedJob {
  job_id: string;
  source_id: string;
  attempts: number;
}

export interface IngestSummary {
  enqueued: number;
  processed: number;
  succeeded: number;
  unchanged: number;
  retrying: number;
  failed: number;
}

export interface IngestOptions {
  db: SupabaseClient;
  embedder: EmbeddingProvider;
  /** Restrict to one course version (tests, and a future "re-index this course" action). */
  versionId?: string;
  /** Stop claiming new jobs after this long so one cron run never overlaps the next by much. */
  timeBudgetMs?: number;
  batchSize?: number;
}

export async function runKnowledgeIngest(options: IngestOptions): Promise<IngestSummary> {
  const { db, versionId } = options;
  const deadline = Date.now() + (options.timeBudgetMs ?? 45_000);
  const summary: IngestSummary = {
    enqueued: 0,
    processed: 0,
    succeeded: 0,
    unchanged: 0,
    retrying: 0,
    failed: 0,
  };

  const { data: enqueued, error: enqueueError } = await db.rpc("enqueue_lesson_sources", {
    p_version_id: versionId ?? null,
    p_limit: 500,
  });
  if (enqueueError) throw new Error(`enqueue_lesson_sources failed: ${enqueueError.message}`);
  summary.enqueued = (enqueued as number) ?? 0;

  while (Date.now() < deadline) {
    const { data, error } = await db.rpc("claim_knowledge_jobs", {
      p_limit: options.batchSize ?? 5,
      p_version_id: versionId ?? null,
    });
    if (error) throw new Error(`claim_knowledge_jobs failed: ${error.message}`);
    const jobs = (data ?? []) as ClaimedJob[];
    if (jobs.length === 0) break;
    for (const job of jobs) {
      const outcome = await processJob(db, options.embedder, job);
      summary.processed += 1;
      summary[outcome] += 1;
    }
  }
  return summary;
}

type JobOutcome = "succeeded" | "unchanged" | "retrying" | "failed";

/** Indexes one claimed job. Never throws: errors become a retry or a visible failed source. */
export async function processJob(
  db: SupabaseClient,
  embedder: EmbeddingProvider,
  job: ClaimedJob,
): Promise<JobOutcome> {
  try {
    const prepared = await prepareSource(db, job.source_id);
    if (prepared.contentHash === prepared.previousHash) {
      await complete(db, job.job_id, prepared.contentHash, null);
      return "unchanged";
    }
    const rows = await embedChunks(embedder, prepared.chunks);
    await complete(db, job.job_id, prepared.contentHash, rows);
    return "succeeded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("knowledge.ingest.job_failed", {
      jobId: job.job_id,
      sourceId: job.source_id,
      attempt: job.attempts,
      message,
    });
    const { data, error } = await db.rpc("fail_knowledge_job", {
      p_job_id: job.job_id,
      p_error: message,
      p_max_attempts: MAX_ATTEMPTS,
    });
    if (error)
      log.error("knowledge.ingest.fail_record_failed", {
        jobId: job.job_id,
        message: error.message,
      });
    return data === "failed" ? "failed" : "retrying";
  }
}

interface PreparedSource {
  chunks: Chunk[];
  contentHash: string;
  previousHash: string | null;
}

async function prepareSource(db: SupabaseClient, sourceId: string): Promise<PreparedSource> {
  const { data: source, error } = await db
    .from("knowledge_sources")
    .select("kind, lesson_id, content_hash")
    .eq("id", sourceId)
    .single();
  if (error || !source) throw new Error(`source not found: ${error?.message ?? sourceId}`);
  if (source.kind !== "lesson" || !source.lesson_id) {
    throw new Error(`unsupported source kind: ${source.kind}`);
  }

  const { data: lesson, error: lessonError } = await db
    .from("lessons")
    .select("title, content, course_sections!inner(title, course_versions!inner(title))")
    .eq("id", source.lesson_id)
    .single();
  if (lessonError || !lesson)
    throw new Error(`lesson not found: ${lessonError?.message ?? source.lesson_id}`);

  const section = lesson.course_sections as unknown as {
    title: string;
    course_versions: { title: string };
  };
  const crumb = breadcrumb(section.course_versions.title, section.title, lesson.title as string);
  const paragraphs = htmlToParagraphs((lesson.content as string) ?? "");
  const chunks = chunkParagraphs(paragraphs, crumb);
  return {
    chunks,
    contentHash: sha256(JSON.stringify([crumb, paragraphs])),
    previousHash: (source.content_hash as string | null) ?? null,
  };
}

interface ChunkRow {
  position: number;
  content: string;
  token_count: number;
  content_hash: string;
  embedding: string | null;
  embedding_model: string | null;
}

/**
 * Adds embeddings when a provider is configured. "not_configured" is the normal keyword-only state
 * (ADR-042) and stores no vectors; any other provider failure throws so the job is retried.
 */
async function embedChunks(embedder: EmbeddingProvider, chunks: Chunk[]): Promise<ChunkRow[]> {
  const rows: ChunkRow[] = chunks.map((c) => ({
    position: c.position,
    content: c.content,
    token_count: c.tokenCount,
    content_hash: c.contentHash,
    embedding: null,
    embedding_model: null,
  }));
  for (let i = 0; i < rows.length; i += EMBED_BATCH) {
    const batch = rows.slice(i, i + EMBED_BATCH);
    const result = await embedder.embed(batch.map((r) => r.content));
    if (!result.ok) {
      if (result.reason === "not_configured") return rows;
      throw new Error(`embedding failed: ${result.code}`);
    }
    batch.forEach((row, j) => {
      row.embedding = `[${result.vectors[j].join(",")}]`;
      row.embedding_model = result.model;
    });
  }
  return rows;
}

async function complete(
  db: SupabaseClient,
  jobId: string,
  contentHash: string,
  rows: ChunkRow[] | null,
) {
  const { error } = await db.rpc("complete_knowledge_job", {
    p_job_id: jobId,
    p_content_hash: contentHash,
    p_chunks: rows,
  });
  if (error) throw new Error(`complete_knowledge_job failed: ${error.message}`);
}
