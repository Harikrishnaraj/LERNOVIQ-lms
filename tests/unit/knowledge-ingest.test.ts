// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { processJob, runKnowledgeIngest } from "@/features/knowledge/ingest";
import { createFakeEmbeddingProvider } from "@/services/embeddings/fake";
import { sha256 } from "@/features/knowledge/text";
import type { EmbeddingProvider } from "@/services/embeddings";

// F-800 (T-221): the worker's flow, with the database replaced by a stub recording RPC calls.

interface StubState {
  source: { kind: string; lesson_id: string | null; content_hash: string | null };
  lesson: { title: string; content: string } | null;
  failResult?: "failed" | "retrying";
  claims?: { job_id: string; source_id: string; attempts: number }[][];
}

function stubDb(state: StubState) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "enqueue_lesson_sources") return { data: 2, error: null };
    if (name === "claim_knowledge_jobs") return { data: state.claims?.shift() ?? [], error: null };
    if (name === "fail_knowledge_job") return { data: state.failResult ?? "retrying", error: null };
    if (name === "complete_knowledge_job") return { data: null, error: null, args };
    return { data: null, error: { message: `unexpected rpc ${name}` } };
  });
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () =>
          table === "knowledge_sources"
            ? { data: state.source, error: null }
            : state.lesson
              ? {
                  data: {
                    ...state.lesson,
                    course_sections: {
                      title: "Functions",
                      course_versions: { title: "JS Basics" },
                    },
                  },
                  error: null,
                }
              : { data: null, error: { message: "not found" } },
      }),
    }),
  });
  return { db: { rpc, from } as unknown as SupabaseClient, rpc };
}

const job = { job_id: "job-1", source_id: "src-1", attempts: 1 };
const lessonSource = { kind: "lesson", lesson_id: "lesson-1", content_hash: null };
const lesson = {
  title: "Closures",
  content: "<h2>Closures</h2><p>A closure captures variables.</p>",
};

function completeArgs(rpc: ReturnType<typeof vi.fn>) {
  const call = rpc.mock.calls.find(([name]) => name === "complete_knowledge_job");
  return call?.[1] as
    | { p_job_id: string; p_content_hash: string; p_chunks: Record<string, unknown>[] | null }
    | undefined;
}

describe("processJob", () => {
  it("chunks the lesson with its breadcrumb and stores embeddings when a provider is configured", async () => {
    const { db, rpc } = stubDb({ source: lessonSource, lesson });
    expect(await processJob(db, createFakeEmbeddingProvider(), job)).toBe("succeeded");

    const args = completeArgs(rpc)!;
    expect(args.p_job_id).toBe("job-1");
    expect(args.p_chunks).toHaveLength(1);
    expect(args.p_chunks![0]).toMatchObject({
      position: 0,
      content: "JS Basics › Functions › Closures\n\nClosures\n\nA closure captures variables.",
      embedding_model: "fake-embed-1",
    });
    expect(String(args.p_chunks![0].embedding)).toMatch(/^\[/);
  });

  it("stores chunks without vectors when no embedding provider is configured (keyword-only, ADR-042)", async () => {
    const { db, rpc } = stubDb({ source: lessonSource, lesson });
    const unconfigured: EmbeddingProvider = {
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
    expect(await processJob(db, unconfigured, job)).toBe("succeeded");
    expect(completeArgs(rpc)!.p_chunks![0]).toMatchObject({
      embedding: null,
      embedding_model: null,
    });
  });

  it("skips re-indexing when the lesson text is unchanged", async () => {
    const first = stubDb({ source: lessonSource, lesson });
    await processJob(first.db, createFakeEmbeddingProvider(), job);
    const hash = completeArgs(first.rpc)!.p_content_hash;

    const second = stubDb({ source: { ...lessonSource, content_hash: hash }, lesson });
    expect(await processJob(second.db, createFakeEmbeddingProvider(), job)).toBe("unchanged");
    expect(completeArgs(second.rpc)).toMatchObject({ p_content_hash: hash, p_chunks: null });
  });

  it("retries when the embedding provider fails for another reason", async () => {
    const { db, rpc } = stubDb({ source: lessonSource, lesson });
    expect(await processJob(db, createFakeEmbeddingProvider({ fail: "timeout" }), job)).toBe(
      "retrying",
    );
    expect(rpc).toHaveBeenCalledWith("fail_knowledge_job", {
      p_job_id: "job-1",
      p_error: "embedding failed: fake_timeout",
      p_max_attempts: 3,
    });
    expect(completeArgs(rpc)).toBeUndefined();
  });

  it("reports a source as failed once the database gives up retrying", async () => {
    const { db } = stubDb({ source: lessonSource, lesson: null, failResult: "failed" });
    expect(await processJob(db, createFakeEmbeddingProvider(), job)).toBe("failed");
  });

  it("indexes an empty lesson as ready with no chunks", async () => {
    const { db, rpc } = stubDb({ source: lessonSource, lesson: { title: "Quiz", content: "" } });
    expect(await processJob(db, createFakeEmbeddingProvider(), job)).toBe("succeeded");
    expect(completeArgs(rpc)!.p_chunks).toEqual([]);
    expect(completeArgs(rpc)!.p_content_hash).toBe(
      sha256(JSON.stringify(["JS Basics › Functions › Quiz", []])),
    );
  });
});

describe("runKnowledgeIngest", () => {
  it("enqueues, then claims batches until none are left", async () => {
    const { db, rpc } = stubDb({
      source: lessonSource,
      lesson,
      claims: [[job, { ...job, job_id: "job-2" }], [{ ...job, job_id: "job-3" }], []],
    });
    const summary = await runKnowledgeIngest({
      db,
      embedder: createFakeEmbeddingProvider(),
      versionId: "v1",
    });
    expect(summary).toEqual({
      enqueued: 2,
      processed: 3,
      succeeded: 3,
      unchanged: 0,
      retrying: 0,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledWith("enqueue_lesson_sources", {
      p_version_id: "v1",
      p_limit: 500,
    });
    expect(rpc).toHaveBeenCalledWith("claim_knowledge_jobs", { p_limit: 5, p_version_id: "v1" });
  });
});
