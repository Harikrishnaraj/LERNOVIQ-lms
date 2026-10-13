import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { answerTutorQuestion, type TutorDeps, type TutorQuestion } from "@/features/ai/tutor";
import { HINT_ONLY_RULES, NO_SOURCES_ANSWER } from "@/features/ai/tutor-prompt";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import { createFakeProvider } from "@/services/ai/fake";
import type { ChatProvider, ChatRequest } from "@/services/ai";
import type { EmbeddingProvider } from "@/services/embeddings";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

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

// F-701 / F-801 (T-201, T-224, TEST_PLAN §15) against the real schema, RLS and retrieval: the
// tutor answers an approved, enrolled learner from their own course only, stores the cited lesson,
// refuses everyone else, never lets the model guess, and switches to hints during an assessment.
describe.skipIf(!hasLiveProject)("AI Tutor (T-201, T-224, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aitut");
  const word = tag; // only this test's lessons contain it
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  type U = { id: string; client: SupabaseClient };
  let learner: U, peer: U, noAccess: U;
  let courseA: Awaited<ReturnType<typeof createCourse>>;
  let courseB: Awaited<ReturnType<typeof createCourse>>;
  let requests: ChatRequest[];

  async function user(name: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner");
    learnerIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return { id: u.id, client };
  }

  const recording = (): ChatProvider => {
    const fake = createFakeProvider();
    return {
      ...fake,
      complete: async (req) => {
        requests.push(req);
        return fake.complete(req);
      },
    };
  };

  const ask = (u: U, input: Partial<TutorQuestion>, over: Partial<TutorDeps> = {}) =>
    answerTutorQuestion(
      {
        supabase: u.client,
        db: svc,
        provider: () => recording(),
        userId: u.id,
        allow: async () => true,
        ...over,
      },
      { question: `${word} chlorophyll`, courseId: courseA.courseId, ...input },
    );

  /** The service client, except that the AI settings row is the given one (the real one is shared). */
  const dbWithSettings = (row: Record<string, unknown>) =>
    new Proxy(svc, {
      get(target, prop, receiver) {
        if (prop !== "from") return Reflect.get(target, prop, receiver);
        return (table: string) =>
          table === "ai_settings"
            ? {
                select: () => ({
                  eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
                }),
              }
            : target.from(table);
      },
    });
  const settings = (over: Record<string, unknown> = {}) => ({
    tutor_enabled: true,
    tutor_model: null,
    max_answer_tokens: 1500,
    daily_question_cap: 150,
    hint_only_always: false,
    ...over,
  });

  beforeAll(async () => {
    learner = await user("lrn");
    peer = await user("peer");
    noAccess = await user("none");
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);

    courseA = await createCourse(svc, instructor.id, {
      slug: `${tag}-a`,
      title: `${tag} Biology`,
      sections: [
        {
          title: "Plants",
          lessons: [
            {
              title: "Photosynthesis",
              content: `<p>${word} chlorophyll turns light into chemical energy.</p>`,
            },
            { title: "Cell walls", content: `<p>${word} cellulose keeps plant cells rigid.</p>` },
          ],
        },
      ],
    });
    courseB = await createCourse(svc, instructor.id, {
      slug: `${tag}-b`,
      title: `${tag} Other`,
      sections: [
        {
          title: "Unit",
          lessons: [{ title: "Secret", content: `<p>${word} chlorophyll secret of course B.</p>` }],
        },
      ],
    });
    courseIds.push(courseA.courseId, courseB.courseId);
    for (const v of [courseA.versionId, courseB.versionId]) {
      await runKnowledgeIngest({ db: svc, embedder: keywordOnly, versionId: v });
    }

    for (const u of [learner, peer, noAccess]) {
      await svc
        .from("enrollments")
        .insert({ user_id: u.id, course_id: courseA.courseId, version_id: courseA.versionId });
    }
    await svc.from("ai_tutor_access").insert([
      { user_id: learner.id, granted_by: instructor.id },
      { user_id: peer.id, granted_by: instructor.id },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("answers from the learner's course with the current lesson and stores the cited lesson", async () => {
    requests = [];
    const reply = await ask(learner, { lessonId: courseA.lessonIds[0] });
    if (!reply.ok) throw new Error(reply.error);

    expect(reply.answer.sources).toEqual([
      {
        n: 1,
        title: "Photosynthesis",
        lessonId: courseA.lessonIds[0],
        href: `/learner/courses/${courseA.slug}/learn/${courseA.lessonIds[0]}`,
      },
    ]);
    expect(reply.answer.text).toBe(`Fake answer to: ${word} chlorophyll [1]`);
    const prompt = requests[0].messages[0].content;
    expect(prompt).toContain(`Course: ${tag} Biology`);
    expect(prompt).toContain("viewing the lesson: Photosynthesis");
    expect(prompt).not.toContain("secret of course B");

    // Stored for the learner's history, readable with their own session.
    const { data: messages } = await learner.client
      .from("ai_messages")
      .select("role, content, sources, provider, cost_usd")
      .eq("conversation_id", reply.conversationId)
      .order("created_at");
    expect(messages).toEqual([
      expect.objectContaining({ role: "user", content: `${word} chlorophyll` }),
      expect.objectContaining({
        role: "assistant",
        provider: "fake",
        sources: [{ n: 1, title: "Photosynthesis", lessonId: courseA.lessonIds[0] }],
      }),
    ]);
  });

  it("continues the learner's conversation but refuses it to anyone else", async () => {
    const first = await ask(learner, {});
    if (!first.ok) throw new Error(first.error);

    const followUp = await ask(learner, {
      question: "Can you say that more simply?",
      conversationId: first.conversationId,
    });
    expect(followUp).toMatchObject({ ok: true, conversationId: first.conversationId });

    requests = [];
    expect(await ask(peer, { conversationId: first.conversationId })).toMatchObject({
      ok: false,
      code: "not_found",
    });
    expect(requests).toHaveLength(0);
  });

  it("refuses a learner whose tutor is off and records nothing", async () => {
    expect(await ask(noAccess, {})).toMatchObject({ ok: false, code: "no_access" });
    const { count } = await svc
      .from("ai_conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", noAccess.id);
    expect(count).toBe(0);
  });

  it("refuses a course the learner is not enrolled in", async () => {
    expect(await ask(learner, { courseId: courseB.courseId })).toMatchObject({
      ok: false,
      code: "not_enrolled",
    });
  });

  it("answers an unsupported question without calling the model", async () => {
    requests = [];
    const reply = await ask(learner, { question: "Who painted the Mona Lisa?" });
    expect(reply).toMatchObject({
      ok: true,
      answer: { text: NO_SOURCES_ANSWER, sources: [], escalate: true },
    });
    expect(requests).toHaveLength(0);
  });

  it("gives hints only while a graded assessment in the course is in progress", async () => {
    const assessment = await createAssessment(svc, courseA.versionId, {
      title: `${tag} quiz`,
      questions: [
        {
          type: "true_false",
          prompt: "Plants use light?",
          options: ["True", "False"],
          correct: [0],
        },
      ],
    });
    const { data: enrollment } = await svc
      .from("enrollments")
      .select("id")
      .eq("user_id", learner.id)
      .eq("course_id", courseA.courseId)
      .single();
    await svc.from("assessment_attempts").insert({
      assessment_id: assessment.assessmentId,
      enrollment_id: enrollment!.id,
      user_id: learner.id,
      attempt_number: 1,
    });

    requests = [];
    const reply = await ask(learner, {});
    expect(reply).toMatchObject({ ok: true, mode: "hint_only" });
    expect(requests[0].messages[0].content).toContain(HINT_ONLY_RULES);

    // The peer in the same course is unaffected.
    requests = [];
    expect(await ask(peer, {})).toMatchObject({ ok: true, mode: "full" });
    expect(requests[0].messages[0].content).not.toContain(HINT_ONLY_RULES);
  });

  it("records a provider timeout as a failed turn and tells the learner to try again", async () => {
    const reply = await ask(
      learner,
      {},
      { provider: () => createFakeProvider({ fail: "timeout" }) },
    );
    expect(reply).toMatchObject({ ok: false, code: "timeout", conversationId: expect.any(String) });
    const { data } = await learner.client
      .from("ai_messages")
      .select("role, status")
      .eq("conversation_id", reply.ok ? "" : reply.conversationId!)
      .order("created_at");
    expect(data).toEqual([
      { role: "user", status: "ok" },
      { role: "assistant", status: "timeout" },
    ]);
  });

  describe("admin AI settings (T-204)", () => {
    it("refuses everyone when the kill switch is off and records nothing", async () => {
      requests = [];
      const question = `${word} disabled probe`;
      const reply = await ask(
        learner,
        { question },
        { db: dbWithSettings(settings({ tutor_enabled: false })) },
      );
      expect(reply).toMatchObject({ ok: false, code: "disabled" });
      expect(requests).toHaveLength(0);
      const { data: stored } = await svc.from("ai_messages").select("id").eq("content", question);
      expect(stored).toEqual([]);
    });

    it("stops a learner at the daily cap, counted from the questions actually stored", async () => {
      requests = [];
      const reply = await ask(
        learner,
        {},
        { db: dbWithSettings(settings({ daily_question_cap: 1 })) },
      );
      expect(reply).toMatchObject({ ok: false, code: "daily_limit" });
      expect(requests).toHaveLength(0);
      // A peer who has asked less is under the same cap... until they reach it too.
      const { data: asked } = await peer.client.rpc("ai_tutor_questions_since", {
        p_since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });
      const under = await ask(
        peer,
        {},
        { db: dbWithSettings(settings({ daily_question_cap: (asked as number) + 1 })) },
      );
      expect(under).toMatchObject({ ok: true });
      expect(
        await ask(
          peer,
          {},
          { db: dbWithSettings(settings({ daily_question_cap: (asked as number) + 1 })) },
        ),
      ).toMatchObject({ ok: false, code: "daily_limit" });
    });

    it("uses the admin's model and answer length, and hint-only mode for everyone", async () => {
      const models: (string | null)[] = [];
      requests = [];
      const reply = await ask(
        peer,
        {},
        {
          db: dbWithSettings(
            settings({
              tutor_model: "openai/gpt-oss-20b",
              max_answer_tokens: 700,
              hint_only_always: true,
            }),
          ),
          provider: (model) => {
            models.push(model);
            return recording();
          },
        },
      );
      expect(reply).toMatchObject({ ok: true, mode: "hint_only" });
      expect(models).toEqual(["openai/gpt-oss-20b"]);
      expect(requests[0].maxOutputTokens).toBe(700);
      expect(requests[0].messages[0].content).toContain(HINT_ONLY_RULES);
    });
  });
});
