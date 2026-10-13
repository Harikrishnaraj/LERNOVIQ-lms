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
import { answerTutorQuestion, type TutorQuestion } from "@/features/ai/tutor";
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

  const ask = (u: U, input: Partial<TutorQuestion>) =>
    answerTutorQuestion(
      {
        supabase: u.client,
        db: svc,
        provider: () => recording(),
        userId: u.id,
        allow: async () => true,
      },
      { question: `${word} chlorophyll`, courseId: courseA.courseId, ...input },
    );

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
});
