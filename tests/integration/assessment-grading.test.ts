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
  type CreatedCourse,
} from "../support/course-fixtures";

// The Server Actions read the request-scoped client; here it is a client signed in as a test user.
let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { startAttempt, submitAttempt } from "@/features/assessments/attempts";
import { gradeAssessmentAttempt } from "@/features/assessments/grading-actions";
import { getAttemptForGrading, getAttemptGradingQueue } from "@/features/assessments/manual-grading";
import { getAssessmentPageState } from "@/features/assessments/state";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// T-252 (F-107): instructors grade essay/coding answers; a pass completes the course.
describe.skipIf(!hasLiveProject)("manual grading of assessment attempts (T-252, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("mg");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let otherInstructor: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let course: CreatedCourse;
  let exam: CreatedAssessment; // mcq (2) + essay (5) + coding (3), pass mark 70, 3 attempts
  let attemptId: string;

  async function signedIn(name: string, role: "learner" | "instructor", ids: string[]) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    ids.push(u.id);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  const [mcq, essay, coding] = [0, 1, 2];
  const qid = (i: number) => exam.questions[i].id;

  beforeAll(async () => {
    owner = await signedIn("owner", "instructor", userIds);
    otherInstructor = await signedIn("other", "instructor", userIds);
    learner = await signedIn("l", "learner", learnerIds);
    // One quiz lesson linked to the exam: passing the exam is what completes the course.
    course = await createCourse(svc, owner.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      sections: [{ title: "Only", lessons: [{ title: "Final exam", type: "quiz" }] }],
    });
    courseIds.push(course.courseId);
    exam = await createAssessment(svc, course.versionId, {
      title: `${tag} Exam`,
      passMark: 70,
      maxAttempts: 3,
      lessonId: course.lessonIds[0],
      questions: [
        { type: "mcq", prompt: "Pick", options: ["Wrong", "Right"], correct: [1], points: 2 },
        { type: "essay", prompt: "Explain recursion", points: 5 },
        { type: "coding", prompt: "Write fizzbuzz", points: 3 },
      ],
    });
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });

    currentClient = learner.client;
    const started = (await startAttempt(exam.assessmentId)) as { attemptId: string };
    attemptId = started.attemptId;
    const submitted = await submitAttempt(exam.assessmentId, attemptId, {
      [qid(mcq)]: exam.questions[mcq].correctOptionIds[0],
      [qid(essay)]: "A function that calls itself <b>until</b> a base case.",
      [qid(coding)]: "for i in range(1, 16): print(i)",
    });
    expect(submitted).toMatchObject({ submitted: true, status: "submitted", passed: null });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("blocks a new attempt while the submitted one awaits grading", async () => {
    currentClient = learner.client;
    expect(await startAttempt(exam.assessmentId)).toEqual({
      error: "Your last attempt is waiting for your instructor to grade it.",
    });
  });

  it("lists the attempt only in the course owner's queue", async () => {
    const mine = await getAttemptGradingQueue(owner.client);
    expect(mine.find((r) => r.attemptId === attemptId)).toMatchObject({ status: "submitted", attemptNumber: 1 });
    expect((await getAttemptGradingQueue(otherInstructor.client)).some((r) => r.attemptId === attemptId)).toBe(false);
    expect((await getAttemptGradingQueue(learner.client)).some((r) => r.attemptId === attemptId)).toBe(false);
    expect(await getAttemptForGrading(otherInstructor.client, otherInstructor.id, attemptId)).toBeNull();
    expect(await getAttemptForGrading(learner.client, learner.id, attemptId)).toBeNull();
  });

  it("refuses grading by anyone but the course owner, and invalid points", async () => {
    const good = { points: { [qid(essay)]: 5, [qid(coding)]: 3 }, feedback: {}, overall: "" };
    for (const who of [otherInstructor, learner]) {
      currentClient = who.client;
      expect(await gradeAssessmentAttempt(attemptId, good)).toEqual({ ok: false, error: "This attempt is not available." });
    }
    currentClient = owner.client;
    expect(
      await gradeAssessmentAttempt(attemptId, { points: { [qid(essay)]: 6, [qid(coding)]: 3 }, feedback: {}, overall: "" }),
    ).toEqual({ ok: false, error: "Question 2: enter a whole number of points from 0 to 5." });
    expect(
      await gradeAssessmentAttempt(attemptId, {
        points: { [qid(essay)]: 5, [qid(coding)]: 3, [qid(mcq)]: 0 },
        feedback: {},
        overall: "",
      }),
    ).toMatchObject({ ok: false });
    const row = (await svc.from("assessment_attempts").select("status").eq("id", attemptId).single()).data!;
    expect(row.status).toBe("submitted");
  });

  it("grades a fail over every question, and the learner sees the score and feedback", async () => {
    currentClient = owner.client;
    // 2 (mcq) + 2 + 1 = 5 of 10 = 50% < 70%.
    const r = await gradeAssessmentAttempt(attemptId, {
      points: { [qid(essay)]: 2, [qid(coding)]: 1 },
      feedback: { [qid(essay)]: "  Missing the base case discussion.  " },
      overall: "Close: revise and try again.",
    });
    expect(r).toEqual({ ok: true, passed: false, percent: 50, courseCompleted: false });
    const row = (await svc.from("assessment_attempts").select("*").eq("id", attemptId).single()).data!;
    expect(row).toMatchObject({ status: "graded", passed: false, graded_by: owner.id, feedback: "Close: revise and try again." });
    expect(Number(row.score)).toBe(5);
    expect(Number(row.max_score)).toBe(10);

    const state = await getAssessmentPageState(learner.client, learner.id, course.slug, exam.assessmentId);
    expect(state!.latest).toMatchObject({ status: "graded", passed: false, percent: 50 });
    expect(state!.result!.feedback).toBe("Close: revise and try again.");
    const essayResult = state!.result!.questions.find((x) => x.id === qid(essay))!;
    expect(essayResult).toMatchObject({ manual: true, earned: 2, feedback: "Missing the base case discussion." });
    expect(state!.start).toEqual({ ok: true, attemptNumber: 2 });

    const { data: notes } = await svc.from("notifications").select("title").eq("user_id", learner.id);
    expect((notes ?? []).some((n) => n.title === `Your answers on ${tag} Exam were graded`)).toBe(true);
    const { data: audit } = await svc
      .from("audit_logs")
      .select("action, actor_id, metadata")
      .eq("resource_id", attemptId)
      .eq("action", "assessment.attempt_graded");
    expect(audit).toHaveLength(1);
    expect(audit![0]).toMatchObject({ actor_id: owner.id, metadata: { passed: false, regrade: false } });
  });

  it("counts graded attempts in instructor analytics", async () => {
    const { data } = await owner.client.rpc("instructor_assessment_analytics", { p_course_id: course.courseId });
    const stats = (data as { assessment_id: string; total_attempts: number; avg_score: number }[]).find(
      (s) => s.assessment_id === exam.assessmentId,
    )!;
    expect(stats.total_attempts).toBe(1);
    expect(Number(stats.avg_score)).toBe(50);
  });

  it("re-grades to a pass, which completes the course and issues the certificate", async () => {
    currentClient = owner.client;
    const r = await gradeAssessmentAttempt(attemptId, {
      points: { [qid(essay)]: 5, [qid(coding)]: 3 },
      feedback: {},
      overall: "Re-marked: full credit.",
    });
    expect(r).toEqual({ ok: true, passed: true, percent: 100, courseCompleted: true });
    const { data: enrollment } = await svc
      .from("enrollments")
      .select("id, status")
      .eq("user_id", learner.id)
      .eq("course_id", course.courseId)
      .single();
    expect(enrollment!.status).toBe("completed");
    const { data: cert } = await svc.from("certificates").select("status").eq("enrollment_id", enrollment!.id).single();
    expect(cert!.status).toBe("issued");
  });

  it("refuses to turn the pass into a fail once the course is completed", async () => {
    currentClient = owner.client;
    const r = await gradeAssessmentAttempt(attemptId, {
      points: { [qid(essay)]: 0, [qid(coding)]: 0 },
      feedback: {},
      overall: "",
    });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/already completed the course/) });
    const row = (await svc.from("assessment_attempts").select("passed").eq("id", attemptId).single()).data!;
    expect(row.passed).toBe(true);
  });
});
