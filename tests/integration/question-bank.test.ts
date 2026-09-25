import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteBankItem, importFromBank, saveBankItem, saveQuestionToBank } from "@/features/question-bank/actions";
import { listBankItems, listBankTags, parseBankQuery } from "@/features/question-bank/bank";
import { getAssessmentForAuthoring } from "@/features/course-authoring/assessments";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const mcq = (prompt: string) => ({
  type: "mcq", prompt, points: 2, explanation: "Because.", acceptedAnswers: [] as string[],
  options: [{ label: "Right", correct: true }, { label: "Wrong", correct: false }],
});

// F-207: reusable, tagged, private questions imported into assessments as independent copies.
describe.skipIf(!hasLiveProject)("question bank (T-101, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("qb");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let owner: U, other: U, learner: U;
  let draft: Awaited<ReturnType<typeof createCourse>>;
  let locked: Awaited<ReturnType<typeof createCourse>>;
  let quiz: Awaited<ReturnType<typeof createAssessment>>;
  let lockedQuiz: Awaited<ReturnType<typeof createAssessment>>;
  const ids: Record<string, string> = {};

  async function user(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const as = (u: U) => {
    currentClient = u.client;
  };

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    draft = await createCourse(svc, owner.id, { slug: `${tag}-d`, title: `${tag} Draft`, publish: false });
    locked = await createCourse(svc, owner.id, { slug: `${tag}-l`, title: `${tag} Locked`, publish: false });
    courseIds.push(draft.courseId, locked.courseId);
    quiz = await createAssessment(svc, draft.versionId, { title: "Quiz", questions: [] });
    lockedQuiz = await createAssessment(svc, locked.versionId, { title: "Locked quiz", questions: [] });
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", locked.versionId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("creates items with cleaned tags and validates like assessment questions", async () => {
    as(owner);
    expect(await saveBankItem(null, { ...mcq(""), type: "mcq" }, "")).toMatchObject({ ok: false, fieldErrors: { prompt: expect.any(String) } });
    expect(await saveBankItem(null, mcq("Q?"), "a,b,c,d,e,f,g,h,i")).toMatchObject({ ok: false, fieldErrors: { tags: expect.any(String) } });
    const a = await saveBankItem(null, mcq(`${tag} Algebra question`), " Algebra , Week 1 ");
    const b = await saveBankItem(
      null,
      { type: "short_answer", prompt: `${tag} Capital of France`, points: 1, options: [], acceptedAnswers: ["Paris"], explanation: "" },
      "geography",
    );
    const c = await saveBankItem(null, { type: "essay", prompt: `${tag} Discuss testing`, points: 10, options: [], acceptedAnswers: [], explanation: "" }, "");
    ids.a = (a as { id: string }).id;
    ids.b = (b as { id: string }).id;
    ids.c = (c as { id: string }).id;
    const { data } = await svc.from("question_bank_items").select("tags, options").eq("id", ids.a).single();
    expect(data).toEqual({ tags: ["algebra", "week-1"], options: [{ label: "Right", correct: true }, { label: "Wrong", correct: false }] });
  });

  it("lists and filters by text, tag and type; wildcards are literal; tags are counted", async () => {
    const all = await listBankItems(owner.client, parseBankQuery({ q: tag }));
    expect(all.map((i) => i.type).sort()).toEqual(["essay", "mcq", "short_answer"]);
    expect((await listBankItems(owner.client, parseBankQuery({ tag: "algebra" }))).map((i) => i.id)).toEqual([ids.a]);
    expect((await listBankItems(owner.client, parseBankQuery({ type: "short_answer", q: tag }))).map((i) => i.id)).toEqual([ids.b]);
    expect((await listBankItems(owner.client, parseBankQuery({ q: "FRANCE" }))).map((i) => i.id)).toEqual([ids.b]);
    expect(await listBankItems(owner.client, parseBankQuery({ q: "%" }))).toEqual([]);
    const tags = await listBankTags(owner.client);
    expect(tags).toEqual(expect.arrayContaining([{ tag: "algebra", count: 1 }, { tag: "week-1", count: 1 }, { tag: "geography", count: 1 }]));
  });

  it("is private: other instructors and learners see and change nothing", async () => {
    for (const u of [other, learner]) {
      expect(await listBankItems(u.client, parseBankQuery({}))).toEqual([]);
    }
    as(other);
    expect(await saveBankItem(ids.a, mcq("Hijacked"), "")).toEqual({ ok: false, error: "That question is not available." });
    expect(await deleteBankItem(ids.a)).toEqual({ ok: false, error: "That question is not available." });
    as(learner);
    expect(await saveBankItem(null, mcq("Learner question"), "")).toEqual({ ok: false, error: "We could not save that change. Please try again." });
    expect((await svc.from("question_bank_items").select("prompt").eq("id", ids.a).single()).data!.prompt).toBe(`${tag} Algebra question`);
    const forged = await other.client.from("question_bank_items").insert({ owner_id: owner.id, type: "essay", prompt: "forged" });
    expect(forged.error).not.toBeNull();
    await expect(listBankItems(anon(), parseBankQuery({}))).resolves.toEqual([]);
  });

  it("imports selected items into an assessment as independent copies with their answer key", async () => {
    as(owner);
    expect(await importFromBank(draft.courseId, quiz.assessmentId, [])).toEqual({ ok: false, error: "Choose at least one question." });
    expect(await importFromBank(draft.courseId, quiz.assessmentId, [ids.a, ids.b, ids.a, "junk"])).toEqual({ ok: true, imported: 2 });
    const a = (await getAssessmentForAuthoring(owner.client, draft.versionId, quiz.assessmentId))!;
    expect(a.questions.map((q) => [q.type, q.prompt, q.points])).toEqual([["mcq", `${tag} Algebra question`, 2], ["short_answer", `${tag} Capital of France`, 1]]);
    expect(a.questions[0].options.map((o) => [o.label, o.correct])).toEqual([["Right", true], ["Wrong", false]]);
    expect(a.questions[0].explanation).toBe("Because.");
    expect(a.questions[1].acceptedAnswers).toEqual(["Paris"]);

    // Editing the bank afterwards does not touch the imported copy, and the bank keeps the original.
    expect(await saveBankItem(ids.a, mcq("Changed in the bank"), "algebra")).toMatchObject({ ok: true });
    const again = (await getAssessmentForAuthoring(owner.client, draft.versionId, quiz.assessmentId))!;
    expect(again.questions[0].prompt).toBe(`${tag} Algebra question`);
    expect((await listBankItems(owner.client, parseBankQuery({ q: "Changed in the bank" }))).length).toBe(1);
    // Importing twice makes two copies.
    expect(await importFromBank(draft.courseId, quiz.assessmentId, [ids.c])).toEqual({ ok: true, imported: 1 });
    expect((await getAssessmentForAuthoring(owner.client, draft.versionId, quiz.assessmentId))!.questions).toHaveLength(3);
  });

  it("refuses imports into locked courses, foreign assessments and another instructor's items", async () => {
    as(owner);
    expect(await importFromBank(locked.courseId, lockedQuiz.assessmentId, [ids.b])).toEqual({ ok: false, error: "This course is locked while it is in review or published." });
    expect(await importFromBank(draft.courseId, lockedQuiz.assessmentId, [ids.b])).toEqual({ ok: false, error: "That question is not available." });
    as(other);
    expect(await importFromBank(draft.courseId, quiz.assessmentId, [ids.b])).toEqual({ ok: false, error: "That question is not available." });
    // The other instructor cannot import the owner's items into their own assessment either.
    const otherCourse = await createCourse(svc, other.id, { slug: `${tag}-o`, title: `${tag} Other`, publish: false });
    courseIds.push(otherCourse.courseId);
    const otherQuiz = await createAssessment(svc, otherCourse.versionId, { title: "Their quiz", questions: [] });
    expect(await importFromBank(otherCourse.courseId, otherQuiz.assessmentId, [ids.b])).toEqual({ ok: false, error: "That question is not available." });
    expect((await getAssessmentForAuthoring(other.client, otherCourse.versionId, otherQuiz.assessmentId))!.questions).toEqual([]);
    const tooMany = Array.from({ length: 51 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    as(owner);
    expect(await importFromBank(draft.courseId, quiz.assessmentId, tooMany)).toEqual({ ok: false, error: "Import at most 50 questions at a time." });
  });

  it("saves an assessment question to the bank with tags, and deletes bank items", async () => {
    as(owner);
    const q = (await getAssessmentForAuthoring(owner.client, draft.versionId, quiz.assessmentId))!.questions[1];
    const r = await saveQuestionToBank(draft.courseId, quiz.assessmentId, q.id, "from-quiz");
    expect(r.ok).toBe(true);
    const saved = (await svc.from("question_bank_items").select("type, prompt, accepted_answers, tags").eq("id", (r as { id: string }).id).single()).data;
    expect(saved).toEqual({ type: "short_answer", prompt: `${tag} Capital of France`, accepted_answers: ["Paris"], tags: ["from-quiz"] });
    as(other);
    expect(await saveQuestionToBank(draft.courseId, quiz.assessmentId, q.id, "")).toEqual({ ok: false, error: "That question is not available." });

    as(owner);
    expect(await deleteBankItem(ids.c)).toEqual({ ok: true });
    expect(await deleteBankItem(ids.c)).toEqual({ ok: false, error: "That question is not available." });
    expect(await deleteBankItem("nope")).toEqual({ ok: false, error: "That question is not available." });
    // Imported copies survive deleting the bank item.
    expect((await getAssessmentForAuthoring(owner.client, draft.versionId, quiz.assessmentId))!.questions).toHaveLength(3);
  });
});
