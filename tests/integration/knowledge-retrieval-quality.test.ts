import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { EVAL_COURSES, EVAL_QUESTIONS } from "../support/retrieval-eval";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import { searchKnowledge } from "@/features/knowledge/retrieval";
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

// Retrieval quality (T-225, RAG_PLAN §8): 30 learner-style questions, each with the one lesson
// that should answer it, run through the real indexing worker and the permission-aware search
// function exactly as the AI Tutor calls it (the learner's session, scoped to the course, six
// passages). It catches regressions when chunk size, overlap or ranking is tuned.
//
// Thresholds (measured on this fixture with PostgreSQL 16 full-text search, ADR-042: top-1 25/30,
// top-3 30/30, top-6 30/30; asking across all enrolled courses at once finds 29/30 in the top 3).
// The bars below leave room for the odd question to move, but a ranking change that loses real
// ground fails:
//   * the right lesson is the first passage for at least 70% of questions,
//   * and is within the first three for at least 90%,
//   * and is among the six passages the tutor receives for at least 28 of 30.
// Keyword search cannot bridge synonyms; if an embedding provider is added later (ADR-042), raise
// the bars rather than weakening them.
const TOP1_MIN = 21;
const TOP3_MIN = 27;
const TOP6_MIN = 28;
const PASSAGES = 6;

describe.skipIf(!hasLiveProject)("retrieval quality (T-225, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("kbq");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIdByKey = new Map<string, string>();
  let learner: SupabaseClient;

  beforeAll(async () => {
    expect(EVAL_QUESTIONS).toHaveLength(30);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const learnerUser = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerIds.push(learnerUser.id);
    learner = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await learner.auth.signInWithPassword({
      email: learnerUser.email,
      password: learnerUser.password,
    });
    if (error) throw error;

    for (const c of EVAL_COURSES) {
      const created = await createCourse(svc, instructor.id, {
        slug: `${tag}-${c.key}`,
        title: c.title,
        sections: [{ title: "Unit", lessons: c.lessons }],
      });
      courseIds.push(created.courseId);
      courseIdByKey.set(c.key, created.courseId);
      await runKnowledgeIngest({ db: svc, embedder: keywordOnly, versionId: created.versionId });
      await svc.from("enrollments").insert({
        user_id: learnerUser.id,
        course_id: created.courseId,
        version_id: created.versionId,
      });
    }
  }, 300_000);

  afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  async function rankOf(question: string, lesson: string, courseId: string | null) {
    const result = await searchKnowledge(learner, question, {
      courseId,
      limit: courseId ? PASSAGES : 20,
    });
    if (!result.ok) throw new Error(result.error);
    const index = result.passages.findIndex((p) => p.title === lesson);
    return index === -1 ? null : index + 1;
  }

  it("indexes all 30 lessons", async () => {
    const { count } = await svc
      .from("knowledge_sources")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready")
      .in(
        "course_version_id",
        (await svc.from("course_versions").select("id").in("course_id", courseIds)).data!.map(
          (v) => v.id,
        ),
      );
    expect(count).toBe(30);
  });

  it("finds the right lesson for the course-scoped questions the tutor asks", async () => {
    const ranks: { question: string; lesson: string; rank: number | null }[] = [];
    for (const q of EVAL_QUESTIONS) {
      ranks.push({
        question: q.question,
        lesson: q.lesson,
        rank: await rankOf(q.question, q.lesson, courseIdByKey.get(q.course)!),
      });
    }
    const within = (n: number) => ranks.filter((r) => r.rank !== null && r.rank <= n).length;
    const misses = (n: number) =>
      ranks
        .filter((r) => r.rank === null || r.rank > n)
        .map((r) => `"${r.question}" -> ${r.lesson} (rank ${r.rank ?? "none"})`)
        .join("\n");

    console.info(
      `retrieval quality: top-1 ${within(1)}/30, top-3 ${within(3)}/30, top-${PASSAGES} ${within(PASSAGES)}/30`,
    );
    expect(within(1), `not first:\n${misses(1)}`).toBeGreaterThanOrEqual(TOP1_MIN);
    expect(within(3), `not in the top 3:\n${misses(3)}`).toBeGreaterThanOrEqual(TOP3_MIN);
    expect(within(PASSAGES), `not retrieved:\n${misses(PASSAGES)}`).toBeGreaterThanOrEqual(
      TOP6_MIN,
    );
  });

  it("still finds the lesson when the question is asked across all enrolled courses", async () => {
    let inTopFive = 0;
    const missed: string[] = [];
    for (const q of EVAL_QUESTIONS) {
      const rank = await rankOf(q.question, q.lesson, null);
      if (rank !== null && rank <= 5) inTopFive += 1;
      else missed.push(`"${q.question}" -> ${q.lesson} (rank ${rank ?? "none"})`);
    }
    expect(inTopFive, `not in the top 5:\n${missed.join("\n")}`).toBeGreaterThanOrEqual(27);
  });
});
