import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
  type CreatedAssessment,
} from "../support/course-fixtures";

// The Server Actions read the request-scoped client; here it is a client signed in as a test user.
let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveAnswers, startAttempt, submitAttempt } from "@/features/assessments/attempts";
import { getAssessmentPageState } from "@/features/assessments/state";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-107 / TEST_PLAN section 7 against the live project.
describe.skipIf(!hasLiveProject)("assessment attempts (T-039, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("at");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let learner: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let quiz: CreatedAssessment; // 2 attempts, mcq + multi + short, no timer
  let timed: CreatedAssessment; // 1 attempt, 10 minute limit
  let essay: CreatedAssessment; // mcq + essay
  let unlimited: CreatedAssessment;

  async function user(name: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner");
    learnerIds.push(u.id);
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  const q = (a: CreatedAssessment) => a.questions;
  const rightAnswers = (a: CreatedAssessment) => ({
    [q(a)[0].id]: q(a)[0].correctOptionIds[0],
    [q(a)[1].id]: q(a)[1].correctOptionIds,
    [q(a)[2].id]: "  PARIS ",
  });
  const wrongAnswers = (a: CreatedAssessment) => ({ [q(a)[0].id]: q(a)[0].optionIds[0] });
  const attemptRow = async (id: string) =>
    (await svc.from("assessment_attempts").select("*").eq("id", id).single()).data!;

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    learner = await user("l");
    outsider = await user("o");
    course = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} course` });
    courseIds.push(course.courseId);
    const three = [
      { type: "mcq" as const, prompt: "Pick", options: ["Wrong", "Right"], correct: [1] },
      { type: "multi" as const, prompt: "Pick two", options: ["A", "B", "C"], correct: [0, 2], points: 2 },
      { type: "short_answer" as const, prompt: "Capital?", acceptedAnswers: ["Paris"] },
    ];
    quiz = await createAssessment(svc, course.versionId, { title: "Quiz", passMark: 70, maxAttempts: 2, questions: three });
    timed = await createAssessment(svc, course.versionId, {
      title: "Timed",
      passMark: 70,
      maxAttempts: 1,
      timeLimitMinutes: 10,
      questions: three,
    });
    unlimited = await createAssessment(svc, course.versionId, { title: "Unlimited", maxAttempts: null, questions: three });
    essay = await createAssessment(svc, course.versionId, {
      title: "Essay",
      questions: [
        { type: "mcq", prompt: "Pick", options: ["Wrong", "Right"], correct: [1] },
        { type: "essay", prompt: "Explain", points: 5 },
      ],
    });
    await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("starts an attempt, resumes it instead of starting a second, and saves sanitized answers", async () => {
    currentClient = learner.client;
    const started = await startAttempt(quiz.assessmentId);
    expect("attemptId" in started).toBe(true);
    const attemptId = (started as { attemptId: string }).attemptId;
    expect(await startAttempt(quiz.assessmentId)).toEqual({ attemptId });

    const saved = await saveAnswers(quiz.assessmentId, attemptId, {
      ...wrongAnswers(quiz),
      "not-a-question": "x",
      [q(quiz)[1].id]: [q(quiz)[1].optionIds[0], "bogus-option"],
    });
    expect(saved).toEqual({ saved: true });
    const row = await attemptRow(attemptId);
    expect(row.answers).toEqual({
      [q(quiz)[0].id]: q(quiz)[0].optionIds[0],
      [q(quiz)[1].id]: [q(quiz)[1].optionIds[0]],
    });
    expect(row.expires_at).toBeNull();
  });

  it("grades on the server, fails below the pass mark, and keeps the key hidden until retries run out", async () => {
    currentClient = learner.client;
    const { data: open } = await svc
      .from("assessment_attempts")
      .select("id")
      .eq("assessment_id", quiz.assessmentId)
      .eq("status", "in_progress")
      .single();
    const first = await submitAttempt(quiz.assessmentId, open!.id, wrongAnswers(quiz));
    expect(first).toMatchObject({ submitted: true, status: "graded", passed: false });

    let state = await getAssessmentPageState(learner.client, learner.id, `${tag}-c`, quiz.assessmentId);
    expect(state!.result!.revealed).toBe(false);
    expect(JSON.stringify(state)).not.toMatch(/correctOptionIds|acceptedAnswers|explanation/);
    expect(state!.start).toEqual({ ok: true, attemptNumber: 2 });

    // Retry (attempt 2) with everything right: passes with 100%, key now revealed.
    const second = await startAttempt(quiz.assessmentId);
    const id2 = (second as { attemptId: string }).attemptId;
    const done = await submitAttempt(quiz.assessmentId, id2, rightAnswers(quiz));
    expect(done).toMatchObject({ submitted: true, status: "graded", percent: 100, passed: true });
    const row = await attemptRow(id2);
    expect(row).toMatchObject({ attempt_number: 2, status: "graded", passed: true });
    expect(Number(row.score)).toBe(4);

    state = await getAssessmentPageState(learner.client, learner.id, `${tag}-c`, quiz.assessmentId);
    expect(state!.result!.revealed).toBe(true);
    expect(state!.result!.questions[0].correctOptionIds).toEqual(q(quiz)[0].correctOptionIds);
  });

  it("refuses more attempts than allowed", async () => {
    currentClient = learner.client;
    expect(await startAttempt(quiz.assessmentId)).toEqual({
      error: "You have used all your attempts for this assessment.",
    });
  });

  it("allows unlimited retries when max attempts is null", async () => {
    currentClient = learner.client;
    for (let i = 0; i < 3; i++) {
      const s = (await startAttempt(unlimited.assessmentId)) as { attemptId: string };
      await submitAttempt(unlimited.assessmentId, s.attemptId, wrongAnswers(unlimited));
    }
    expect("attemptId" in (await startAttempt(unlimited.assessmentId))).toBe(true);
  });

  it("does not regrade on a repeated submit", async () => {
    currentClient = learner.client;
    const { data: done } = await svc
      .from("assessment_attempts")
      .select("id, score")
      .eq("assessment_id", quiz.assessmentId)
      .eq("attempt_number", 2)
      .single();
    const again = await submitAttempt(quiz.assessmentId, done!.id, wrongAnswers(quiz));
    expect(again).toMatchObject({ submitted: true, status: "graded", percent: 100, passed: true });
    expect(Number((await attemptRow(done!.id)).score)).toBe(Number(done!.score));
  });

  it("sets a deadline for timed assessments and ignores late edits (grades what was autosaved)", async () => {
    currentClient = learner.client;
    const s = (await startAttempt(timed.assessmentId)) as { attemptId: string };
    const row = await attemptRow(s.attemptId);
    const minutes = (new Date(row.expires_at).getTime() - new Date(row.started_at).getTime()) / 60000;
    expect(Math.round(minutes)).toBe(10);

    // Pretend the deadline (and the grace period) passed while nothing was saved.
    await svc
      .from("assessment_attempts")
      .update({ expires_at: new Date(Date.now() - 120_000).toISOString() })
      .eq("id", s.attemptId);
    expect(await saveAnswers(timed.assessmentId, s.attemptId, rightAnswers(timed))).toEqual({
      error: "Time is up for this attempt.",
    });
    const late = await submitAttempt(timed.assessmentId, s.attemptId, rightAnswers(timed));
    expect(late).toMatchObject({ submitted: true, status: "graded", percent: 0, passed: false });
    expect(await startAttempt(timed.assessmentId)).toEqual({
      error: "You have used all your attempts for this assessment.",
    });
  });

  it("grades an expired attempt when the learner returns to the page", async () => {
    currentClient = learner.client;
    const s = (await startAttempt(essay.assessmentId)) as { attemptId: string };
    await saveAnswers(essay.assessmentId, s.attemptId, { [q(essay)[0].id]: q(essay)[0].optionIds[1] });
    await svc
      .from("assessment_attempts")
      .update({ expires_at: new Date(Date.now() - 5000).toISOString() })
      .eq("id", s.attemptId);
    const state = await getAssessmentPageState(learner.client, learner.id, `${tag}-c`, essay.assessmentId);
    expect(state!.inProgress).toBeNull();
    expect(state!.latest).toMatchObject({ status: "submitted" });
  });

  it("marks essay questions for manual review and withholds pass/fail", async () => {
    currentClient = learner.client;
    const state = await getAssessmentPageState(learner.client, learner.id, `${tag}-c`, essay.assessmentId);
    expect(state!.latest).toMatchObject({ status: "submitted", passed: null });
    expect(state!.result!.questions.find((x) => x.type === "essay")!.correct).toBeNull();
  });

  it("refuses everything for a learner who is not enrolled", async () => {
    currentClient = outsider.client;
    const none = { error: "This assessment is not available." };
    expect(await startAttempt(quiz.assessmentId)).toEqual(none);
    const { data: any } = await svc.from("assessment_attempts").select("id").limit(1).single();
    expect(await saveAnswers(quiz.assessmentId, any!.id, {})).toEqual(none);
    expect(await submitAttempt(quiz.assessmentId, any!.id, {})).toEqual(none);
    expect(await getAssessmentPageState(outsider.client, outsider.id, `${tag}-c`, quiz.assessmentId)).toBeNull();
  });

  it("rejects malformed ids and a slug that does not match the assessment course", async () => {
    currentClient = learner.client;
    expect(await startAttempt("not-a-uuid")).toEqual({ error: "This assessment is not available." });
    expect(await getAssessmentPageState(learner.client, learner.id, "some-other-course", quiz.assessmentId)).toBeNull();
  });
});
