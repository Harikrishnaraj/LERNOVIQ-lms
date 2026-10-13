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
import { getTutorMode } from "@/features/ai/policy";
import { runChatTurn } from "@/features/ai/usage";
import { createFakeProvider } from "@/services/ai/fake";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-700 (T-200): AI usage is recorded server-side, readable only by its owner or ai.read_all, and
// the tutor policy sees only the caller's own in-progress graded attempts.
describe.skipIf(!hasLiveProject)("AI platform (T-200, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aiplat");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let courseId: string;
  let conversationId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    learner = await user("lrn", "learner");
    other = await user("oth", "learner");
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
    });
    courseIds.push(course.courseId);
    courseId = course.courseId;

    const assessment = await createAssessment(svc, course.versionId, {
      title: `${tag} quiz`,
      questions: [
        { type: "true_false", prompt: "Water is wet?", options: ["True", "False"], correct: [0] },
      ],
    });
    const { data: enrollment } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: courseId, version_id: course.versionId })
      .select("id")
      .single();
    await svc.from("assessment_attempts").insert({
      assessment_id: assessment.assessmentId,
      enrollment_id: enrollment!.id,
      user_id: learner.id,
      attempt_number: 1,
    });

    const turn = await runChatTurn({
      db: svc,
      provider: createFakeProvider({ reply: "Think about the base case." }),
      userId: learner.id,
      feature: "tutor",
      courseId,
      context: [{ role: "system", content: "You are a tutor." }],
      question: `${tag} how does recursion end?`,
    });
    if (!turn.ok) throw new Error(turn.error);
    conversationId = turn.conversationId;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("records the question and the answer with tokens, model and cost", async () => {
    const { data } = await svc
      .from("ai_messages")
      .select("role, content, status, provider, model, input_tokens, output_tokens, cost_usd")
      .eq("conversation_id", conversationId)
      .order("created_at");
    expect(data).toEqual([
      expect.objectContaining({
        role: "user",
        content: `${tag} how does recursion end?`,
        status: "ok",
      }),
      expect.objectContaining({
        role: "assistant",
        content: "Think about the base case.",
        status: "ok",
        provider: "fake",
        model: "fake-tutor-1",
        input_tokens: expect.any(Number),
        output_tokens: expect.any(Number),
        cost_usd: 0,
      }),
    ]);
  });

  it("lets the learner read their own conversation", async () => {
    const { data: conversations } = await learner.client
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId);
    const { data: messages } = await learner.client
      .from("ai_messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(conversations).toHaveLength(1);
    expect(messages).toHaveLength(2);
  });

  it("hides it from another learner", async () => {
    const { data: conversations } = await other.client
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId);
    const { data: messages } = await other.client
      .from("ai_messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(conversations).toEqual([]);
    expect(messages).toEqual([]);
  });

  it("lets an admin with ai.read_all read it for usage and cost reporting", async () => {
    const { data } = await admin.client
      .from("ai_messages")
      .select("cost_usd")
      .eq("conversation_id", conversationId);
    expect(data).toHaveLength(2);
  });

  it("gives users no way to write usage records themselves", async () => {
    const conv = await learner.client
      .from("ai_conversations")
      .insert({ user_id: learner.id, feature: "tutor" });
    expect(conv.error).not.toBeNull();
    const msg = await learner.client
      .from("ai_messages")
      .insert({
        conversation_id: conversationId,
        role: "assistant",
        content: "forged",
        cost_usd: 0,
      });
    expect(msg.error).not.toBeNull();
    const upd = await learner.client
      .from("ai_messages")
      .update({ cost_usd: 0 })
      .eq("conversation_id", conversationId)
      .select("id");
    expect(upd.data ?? []).toEqual([]);
    const job = await learner.client
      .from("ai_generation_jobs")
      .insert({ user_id: learner.id, kind: "summary" });
    expect(job.error).not.toBeNull();
  });

  it("hides AI records from anonymous visitors", async () => {
    const { data } = await anon()
      .from("ai_messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(data ?? []).toEqual([]);
  });

  it("puts the tutor in hint-only mode during the learner's in-progress graded attempt", async () => {
    expect(await getTutorMode(learner.client, courseId)).toBe("hint_only");
  });

  it("reports only the caller's own attempts", async () => {
    expect(await getTutorMode(other.client, courseId)).toBe("full");
  });

  it("returns to full mode once the attempt is submitted", async () => {
    await svc.from("assessment_attempts").update({ status: "submitted" }).eq("user_id", learner.id);
    expect(await getTutorMode(learner.client, courseId)).toBe("full");
  });

  it("denies the policy check to anonymous callers", async () => {
    const { error } = await anon().rpc("has_active_graded_attempt", { p_course_id: courseId });
    expect(error).not.toBeNull();
  });
});
