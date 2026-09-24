import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLearnerAssessment } from "@/features/assessments/learner";
import { gradeAttempt } from "@/features/assessments/grading";
import { getAssessmentForAuthoring, listAssessments } from "@/features/course-authoring/assessments";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createAssessment,
  deleteAssessment,
  deleteQuestion,
  reorderQuestions,
  saveQuestion,
  updateAssessmentSettings,
} from "@/features/course-authoring/assessment-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const mcq = (over = {}) => ({
  type: "mcq",
  prompt: "Pick the right one",
  points: 2,
  options: [
    { label: "Wrong", correct: false },
    { label: "Right", correct: true },
    { label: "Nope", correct: false },
  ],
  acceptedAnswers: [],
  explanation: "Because.",
  ...over,
});

// F-205 assessment builder, against the live project.
describe.skipIf(!hasLiveProject)("assessment authoring (T-054, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aa");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let assessmentId: string;
  let quizLessonId: string;
  let textLessonId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const authoring = async () => (await getAssessmentForAuthoring(owner.client, course.versionId, assessmentId))!;

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    course = await createCourse(svc, owner.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      publish: false,
      sections: [{ title: "S", lessons: [{ title: "The quiz", type: "quiz" }, { title: "Reading", type: "text" }] }],
    });
    [quizLessonId, textLessonId] = course.lessonIds;
    courseIds.push(course.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("creates an assessment attached to a quiz lesson, with sensible defaults", async () => {
    currentClient = owner.client;
    const r = await createAssessment(course.courseId, { title: "Final exam", lessonId: quizLessonId });
    expect(r).toMatchObject({ ok: true, id: expect.any(String) });
    assessmentId = (r as { id: string }).id;
    const a = await authoring();
    expect(a).toMatchObject({ title: "Final exam", lessonId: quizLessonId, passMark: 70, maxAttempts: null, timeLimitMinutes: null, questions: [] });
  });

  it("refuses non-quiz lessons, duplicate links, foreign lessons and empty titles", async () => {
    currentClient = owner.client;
    expect(await createAssessment(course.courseId, { title: "x", lessonId: textLessonId })).toEqual({ ok: false, error: "Only quiz lessons can have an assessment." });
    expect(await createAssessment(course.courseId, { title: "again", lessonId: quizLessonId })).toEqual({ ok: false, error: "That quiz lesson already has an assessment." });
    const foreign = await createCourse(svc, other.id, { slug: `${tag}-f`, title: `${tag} foreign`, publish: false, sections: [{ title: "S", lessons: [{ title: "Q", type: "quiz" }] }] });
    courseIds.push(foreign.courseId);
    expect(await createAssessment(course.courseId, { title: "x", lessonId: foreign.lessonIds[0] })).toEqual({ ok: false, error: "This assessment is not available." });
    expect(await createAssessment(course.courseId, { title: "  " })).toMatchObject({ ok: false });
  });

  it("updates settings and validates them", async () => {
    currentClient = owner.client;
    expect(
      await updateAssessmentSettings(course.courseId, assessmentId, { title: "Final exam v2", description: "Be careful", passMark: 80, maxAttempts: 3, timeLimitMinutes: 45 }),
    ).toMatchObject({ ok: true });
    expect(await authoring()).toMatchObject({ title: "Final exam v2", description: "Be careful", passMark: 80, maxAttempts: 3, timeLimitMinutes: 45 });
    const bad = await updateAssessmentSettings(course.courseId, assessmentId, { title: "", description: "", passMark: 150, maxAttempts: 0, timeLimitMinutes: 0 });
    expect(bad).toMatchObject({ ok: false, fieldErrors: { title: expect.any(String), passMark: expect.any(String), maxAttempts: expect.any(String), timeLimitMinutes: expect.any(String) } });
  });

  it("saves every question type atomically with the right key", async () => {
    currentClient = owner.client;
    const types = [
      mcq(),
      { type: "multi", prompt: "Pick two", points: 3, options: [{ label: "A", correct: true }, { label: "B", correct: true }, { label: "C", correct: false }], acceptedAnswers: [], explanation: "" },
      { type: "true_false", prompt: "The sky is blue", points: 1, options: [{ label: "True", correct: true }, { label: "False", correct: false }], acceptedAnswers: [], explanation: "" },
      { type: "short_answer", prompt: "Capital of France?", points: 1, options: [], acceptedAnswers: ["Paris", "paris, france"], explanation: "" },
      { type: "essay", prompt: "Discuss", points: 10, options: [], acceptedAnswers: [], explanation: "" },
      { type: "coding", prompt: "Write fizzbuzz", points: 20, options: [], acceptedAnswers: [], explanation: "" },
    ];
    for (const t of types) expect(await saveQuestion(course.courseId, assessmentId, null, t), t.type).toMatchObject({ ok: true });

    const a = await authoring();
    expect(a.questions.map((x) => [x.type, x.position])).toEqual(types.map((t, i) => [t.type, i]));
    const [m, multi, tf, short, essay] = a.questions;
    expect(m.options.map((o) => [o.label, o.correct])).toEqual([["Wrong", false], ["Right", true], ["Nope", false]]);
    expect(m.explanation).toBe("Because.");
    expect(multi.options.filter((o) => o.correct).map((o) => o.label)).toEqual(["A", "B"]);
    expect(tf.options.map((o) => [o.label, o.correct])).toEqual([["True", true], ["False", false]]);
    expect(short.acceptedAnswers).toEqual(["Paris", "paris, france"]);
    expect(essay.options).toEqual([]);
    expect(essay.acceptedAnswers).toEqual([]);
  });

  it("stores keys the grader understands, and shows the learner none of them", async () => {
    const a = await authoring();
    // Grade with the same rules the player uses, using the keys as authored.
    const keyed = a.questions.map((q) => ({
      id: q.id,
      type: q.type,
      points: q.points,
      correctOptionIds: q.options.filter((o) => o.correct).map((o) => o.id),
      acceptedAnswers: q.acceptedAnswers,
    }));
    const [m, multi, tf, short] = a.questions;
    const answers = {
      [m.id]: m.options.find((o) => o.correct)!.id,
      [multi.id]: multi.options.filter((o) => o.correct).map((o) => o.id),
      [tf.id]: tf.options.find((o) => o.correct)!.id,
      [short.id]: "PARIS",
    };
    expect(gradeAttempt(keyed, answers, 50)).toMatchObject({ score: 7, maxScore: 7, percent: 100, passed: null, pendingManual: true });

    await svc.from("enrollments").insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });
    const seen = await getLearnerAssessment(learner.client, assessmentId);
    expect(seen!.questions).toHaveLength(6);
    const json = JSON.stringify(seen);
    for (const secret of ["Because.", "paris, france", "correct", "acceptedAnswers", "explanation"]) expect(json).not.toContain(secret);
  });

  it("re-saving a question replaces its options and key without duplicating rows", async () => {
    currentClient = owner.client;
    const [m] = (await authoring()).questions;
    const r = await saveQuestion(course.courseId, assessmentId, m.id, mcq({ prompt: "Reworded", options: [{ label: "X", correct: true }, { label: "Y", correct: false }] }));
    expect(r).toMatchObject({ ok: true });
    const after = (await authoring()).questions[0];
    expect(after).toMatchObject({ id: m.id, prompt: "Reworded", position: 0 });
    expect(after.options.map((o) => [o.label, o.correct])).toEqual([["X", true], ["Y", false]]);
    const { count } = await svc.from("assessment_options").select("id", { count: "exact", head: true }).eq("question_id", m.id);
    expect(count).toBe(2);
    const { count: keys } = await svc.from("assessment_answer_keys").select("question_id", { count: "exact", head: true }).eq("question_id", m.id);
    expect(keys).toBe(1);
  });

  it("rejects invalid questions with field errors and writes nothing", async () => {
    currentClient = owner.client;
    const before = (await authoring()).questions.length;
    const r = await saveQuestion(course.courseId, assessmentId, null, mcq({ options: [{ label: "Only", correct: true }] }));
    expect(r).toMatchObject({ ok: false, fieldErrors: { options: expect.any(String) } });
    expect(await saveQuestion(course.courseId, assessmentId, null, mcq({ type: "hologram" }))).toMatchObject({ ok: false, fieldErrors: { type: expect.any(String) } });
    expect((await authoring()).questions).toHaveLength(before);
  });

  it("reorders questions (exact permutations only) and re-numbers after a delete", async () => {
    currentClient = owner.client;
    const ids = (await authoring()).questions.map((q) => q.id);
    const reversed = [...ids].reverse();
    expect(await reorderQuestions(course.courseId, assessmentId, reversed)).toMatchObject({ ok: true });
    expect((await authoring()).questions.map((q) => q.id)).toEqual(reversed);
    const stale = { ok: false, error: "The questions changed elsewhere. Refresh and try again." };
    expect(await reorderQuestions(course.courseId, assessmentId, reversed.slice(1))).toEqual(stale);
    expect(await reorderQuestions(course.courseId, assessmentId, [...reversed, reversed[0]])).toEqual(stale);

    expect(await deleteQuestion(course.courseId, assessmentId, reversed[0])).toMatchObject({ ok: true });
    const after = (await authoring()).questions;
    expect(after.map((q) => q.position)).toEqual(after.map((_, i) => i));
    expect(await deleteQuestion(course.courseId, assessmentId, reversed[0])).toEqual({ ok: false, error: "This assessment is not available." });
  });

  it("is refused for other instructors, learners and mismatched ids", async () => {
    const denied = { ok: false, error: "This assessment is not available." };
    for (const who of [other, learner]) {
      currentClient = who.client;
      expect(await saveQuestion(course.courseId, assessmentId, null, mcq())).toEqual(denied);
      expect(await updateAssessmentSettings(course.courseId, assessmentId, { title: "Hijack", description: "", passMark: 1, maxAttempts: null, timeLimitMinutes: null })).toEqual(denied);
      expect(await deleteAssessment(course.courseId, assessmentId)).toEqual(denied);
    }
    // Other instructor own course id + this assessment id.
    const theirs = await createCourse(svc, other.id, { slug: `${tag}-t`, title: `${tag} theirs`, publish: false });
    courseIds.push(theirs.courseId);
    currentClient = other.client;
    expect(await saveQuestion(theirs.courseId, assessmentId, null, mcq())).toEqual(denied);
    // The key data is unreadable to them too.
    expect(await getAssessmentForAuthoring(other.client, course.versionId, assessmentId)).toBeNull();
    expect((await authoring()).title).toBe("Final exam v2");
  });

  it("is locked while the version is in review, and lists assessments with counts", async () => {
    currentClient = owner.client;
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", course.versionId);
    const locked = { ok: false, error: "This course is locked while it is in review or published." };
    expect(await saveQuestion(course.courseId, assessmentId, null, mcq())).toEqual(locked);
    expect(await deleteAssessment(course.courseId, assessmentId)).toEqual(locked);
    await svc.from("course_versions").update({ status: "draft" }).eq("id", course.versionId);

    const list = await listAssessments(owner.client, course.versionId);
    expect(list).toEqual([{ id: assessmentId, title: "Final exam v2", lessonId: quizLessonId, lessonTitle: "The quiz", questionCount: 5 }]);
  });

  it("deletes an assessment with its questions, options and keys", async () => {
    currentClient = owner.client;
    const qs = (await authoring()).questions.map((q) => q.id);
    expect(await deleteAssessment(course.courseId, assessmentId)).toMatchObject({ ok: true });
    expect(await getAssessmentForAuthoring(owner.client, course.versionId, assessmentId)).toBeNull();
    const { count } = await svc.from("assessment_questions").select("id", { count: "exact", head: true }).in("id", qs);
    expect(count).toBe(0);
    const { count: keys } = await svc.from("assessment_answer_keys").select("question_id", { count: "exact", head: true }).in("question_id", qs);
    expect(keys).toBe(0);
  });
});
