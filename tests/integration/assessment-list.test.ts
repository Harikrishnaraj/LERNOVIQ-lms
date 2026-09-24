import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listMyAssessments } from "@/features/assessments/list";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

describe.skipIf(!hasLiveProject)("listMyAssessments (T-043, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("al");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let learner: { id: string; client: SupabaseClient };
  let stranger: { id: string; client: SupabaseClient };

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

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    learner = await user("l");
    stranger = await user("s");
    const course = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} course` });
    courseIds.push(course.courseId);
    const q = [{ type: "mcq" as const, prompt: "Q", options: ["a", "b"], correct: [0] }];
    const fresh = await createAssessment(svc, course.versionId, { title: "Fresh", questions: q });
    const retry = await createAssessment(svc, course.versionId, { title: "Retry", maxAttempts: 3, questions: q });
    const passed = await createAssessment(svc, course.versionId, { title: "Passed", questions: q });
    const final = await createAssessment(svc, course.versionId, { title: "Final", maxAttempts: 1, questions: q });
    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    const attempt = (assessmentId: string, n: number, percent: number, passedFlag: boolean) =>
      svc.from("assessment_attempts").insert({
        assessment_id: assessmentId,
        enrollment_id: enr!.id,
        user_id: learner.id,
        attempt_number: n,
        status: "graded",
        percent,
        passed: passedFlag,
        submitted_at: new Date().toISOString(),
      });
    await attempt(retry.assessmentId, 1, 40, false);
    await attempt(passed.assessmentId, 1, 30, false);
    await attempt(passed.assessmentId, 2, 90, true);
    await attempt(final.assessmentId, 1, 10, false);
    void fresh;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("lists every assessment of the learner courses with status, attempts and scores", async () => {
    const list = await listMyAssessments(learner.client, learner.id);
    const by = Object.fromEntries(list.map((a) => [a.title, a]));
    expect(Object.keys(by).sort()).toEqual(["Final", "Fresh", "Passed", "Retry"]);
    expect(by.Fresh).toMatchObject({ status: "not_started", attemptsUsed: 0, bestPercent: null });
    expect(by.Retry).toMatchObject({ status: "failed_retry", attemptsUsed: 1, maxAttempts: 3, bestPercent: 40 });
    expect(by.Passed).toMatchObject({ status: "passed", attemptsUsed: 2, bestPercent: 90, lastPercent: 90 });
    expect(by.Final).toMatchObject({ status: "failed_final", attemptsUsed: 1, bestPercent: 10 });
    expect(by.Fresh.courseSlug).toBe(`${tag}-c`);
  });

  it("is empty for a learner with no enrollments", async () => {
    expect(await listMyAssessments(stranger.client, stranger.id)).toEqual([]);
  });
});
