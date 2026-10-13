import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import { createFakeEmbeddingProvider } from "@/services/embeddings/fake";
import type { EmbeddingProvider } from "@/services/embeddings";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

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

// F-800 (T-221): published lessons are indexed into searchable chunks by the worker; drafts are
// not; failures are retried and then visible on the source; deleting a lesson removes its chunks.
describe.skipIf(!hasLiveProject)("lesson indexing pipeline (T-221, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("kbing");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let published: Awaited<ReturnType<typeof createCourse>>;
  let draft: Awaited<ReturnType<typeof createCourse>>;

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    published = await createCourse(svc, instructor.id, {
      slug: `${tag}-pub`,
      title: `${tag} JavaScript Basics`,
      sections: [
        {
          title: "Functions",
          lessons: [
            {
              title: "Closures",
              content:
                "<h2>Closures</h2><p>A closure captures variables from its enclosing scope.</p>",
            },
            {
              title: "Recursion",
              content: "<p>Recursion needs a base case so the function terminates.</p>",
            },
            { title: "Empty quiz", type: "quiz", content: "" },
          ],
        },
      ],
    });
    draft = await createCourse(svc, instructor.id, {
      slug: `${tag}-draft`,
      title: `${tag} Draft Course`,
      publish: false,
      sections: [
        {
          title: "S",
          lessons: [{ title: "Secret draft", content: "<p>unpublished draft text</p>" }],
        },
      ],
    });
    courseIds.push(published.courseId, draft.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { courseIds, userIds }), 120_000);

  const sources = async (versionId: string) =>
    (
      await svc
        .from("knowledge_sources")
        .select("id, lesson_id, status, chunk_count, error, content_hash")
        .eq("course_version_id", versionId)
    ).data ?? [];

  it("indexes every lesson of a published version and makes it searchable by keyword", async () => {
    const summary = await runKnowledgeIngest({
      db: svc,
      embedder: keywordOnly,
      versionId: published.versionId,
    });
    expect(summary).toMatchObject({ enqueued: 3, processed: 3, succeeded: 3, failed: 0 });

    const rows = await sources(published.versionId);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "ready" && r.error === null)).toBe(true);
    const quiz = rows.find((r) => r.lesson_id === published.lessonIds[2])!;
    expect(quiz.chunk_count).toBe(0);

    const { data: hits } = await svc
      .from("knowledge_chunks")
      .select("lesson_id, content, embedding_model")
      .eq("course_version_id", published.versionId)
      .textSearch("fts", "terminates", { config: "english", type: "websearch" });
    expect(hits).toHaveLength(1);
    expect(hits![0]).toMatchObject({ lesson_id: published.lessonIds[1], embedding_model: null });
    expect(hits![0].content).toContain(`${tag} JavaScript Basics › Functions › Recursion`);
  });

  it("finds a lesson by its course or lesson name too (breadcrumb prefix)", async () => {
    const { data } = await svc
      .from("knowledge_chunks")
      .select("lesson_id")
      .eq("course_version_id", published.versionId)
      .textSearch("fts", "closures", { config: "english", type: "websearch" });
    expect(data!.map((d) => d.lesson_id)).toContain(published.lessonIds[0]);
  });

  it("never indexes draft versions", async () => {
    const summary = await runKnowledgeIngest({
      db: svc,
      embedder: keywordOnly,
      versionId: draft.versionId,
    });
    expect(summary.enqueued).toBe(0);
    expect(await sources(draft.versionId)).toEqual([]);
  });

  it("does nothing on a second run: nothing new to enqueue", async () => {
    const summary = await runKnowledgeIngest({
      db: svc,
      embedder: keywordOnly,
      versionId: published.versionId,
    });
    expect(summary).toMatchObject({ enqueued: 0, processed: 0 });
  });

  it("re-indexing unchanged text keeps the chunks; changed text replaces them", async () => {
    const target = (await sources(published.versionId)).find(
      (r) => r.lesson_id === published.lessonIds[0],
    )!;
    await svc.from("knowledge_jobs").insert({ source_id: target.id });
    let summary = await runKnowledgeIngest({
      db: svc,
      embedder: keywordOnly,
      versionId: published.versionId,
    });
    expect(summary).toMatchObject({ processed: 1, unchanged: 1 });

    await svc
      .from("lessons")
      .update({ content: "<p>Closures remember lexical environments.</p>" })
      .eq("id", published.lessonIds[0]);
    await svc.from("knowledge_jobs").insert({ source_id: target.id });
    summary = await runKnowledgeIngest({
      db: svc,
      embedder: createFakeEmbeddingProvider(),
      versionId: published.versionId,
    });
    expect(summary).toMatchObject({ processed: 1, succeeded: 1 });

    const { data: chunks } = await svc
      .from("knowledge_chunks")
      .select("content, embedding_model")
      .eq("source_id", target.id);
    expect(chunks).toHaveLength(1);
    expect(chunks![0].content).toContain("lexical environments");
    expect(chunks![0].content).not.toContain("enclosing scope");
    expect(chunks![0].embedding_model).toBe("fake-embed-1");
  });

  it("retries a failing job, then marks the source failed with its error", async () => {
    const target = (await sources(published.versionId)).find(
      (r) => r.lesson_id === published.lessonIds[1],
    )!;
    // Force re-processing by clearing the stored hash.
    await svc.from("knowledge_sources").update({ content_hash: null }).eq("id", target.id);
    const { data: job } = await svc
      .from("knowledge_jobs")
      .insert({ source_id: target.id })
      .select("id")
      .single();
    const failing = createFakeEmbeddingProvider({ fail: "error" });

    for (let attempt = 1; attempt <= 3; attempt++) {
      // Make the retry due now instead of after the backoff.
      await svc
        .from("knowledge_jobs")
        .update({ run_after: new Date().toISOString() })
        .eq("id", job!.id);
      const summary = await runKnowledgeIngest({
        db: svc,
        embedder: failing,
        versionId: published.versionId,
      });
      expect(summary).toMatchObject(attempt < 3 ? { retrying: 1 } : { failed: 1 });
    }

    const after = (await sources(published.versionId)).find((r) => r.id === target.id)!;
    expect(after).toMatchObject({ status: "failed", error: "embedding failed: fake_error" });
    const { data: jobRow } = await svc
      .from("knowledge_jobs")
      .select("status, attempts")
      .eq("id", job!.id)
      .single();
    expect(jobRow).toEqual({ status: "failed", attempts: 3 });
    // The previous chunks stay searchable while the source is failed.
    const { count } = await svc
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("source_id", target.id);
    expect(count).toBe(1);
  });

  it("removes a lesson's source and chunks when the lesson is deleted", async () => {
    const lessonId = published.lessonIds[0];
    await svc.from("lessons").delete().eq("id", lessonId);
    const { data: src } = await svc
      .from("knowledge_sources")
      .select("id")
      .eq("lesson_id", lessonId);
    const { count } = await svc
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .eq("lesson_id", lessonId);
    expect(src).toEqual([]);
    expect(count).toBe(0);
  });

  it("keeps the worker functions away from clients", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
      },
    );
    for (const fn of ["enqueue_lesson_sources", "claim_knowledge_jobs"]) {
      const { error } = await anon.rpc(fn, {});
      expect(error).not.toBeNull();
    }
  });
});
