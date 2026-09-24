import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

// The Server Actions read the request-scoped client; here it is a client signed in as a test user.
let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { completeLesson, saveVideoPosition } from "@/features/player/progress";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-105 / F-106: progress and resume position persist, and cannot be written outside an enrollment.
describe.skipIf(!hasLiveProject)("completeLesson / saveVideoPosition (T-037, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("pr");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let learner: SupabaseClient;
  let outsider: SupabaseClient;
  let learnerId: string;
  let course: Awaited<ReturnType<typeof createCourse>>;
  let other: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(email: string) {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({
      email,
      password: "fixture-password-1",
    });
    if (error) throw error;
    return client;
  }
  const progressRow = async (lessonId: string) => {
    const { data } = await svc
      .from("lesson_progress")
      .select("completed_at, last_position_seconds")
      .eq("lesson_id", lessonId)
      .eq("enrollment_id", (await enrollmentId())!)
      .maybeSingle();
    return data;
  };
  const enrollmentId = async () =>
    (await svc.from("enrollments").select("id").eq("user_id", learnerId).maybeSingle()).data?.id;

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    const l = await createUserWithRole(svc, `${tag}-l`, "learner");
    const o = await createUserWithRole(svc, `${tag}-o`, "learner");
    learnerIds.push(l.id, o.id);
    learnerId = l.id;
    learner = await signIn(l.email);
    outsider = await signIn(o.email);
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }] }],
    });
    other = await createCourse(svc, instructor.id, {
      slug: `${tag}-x`,
      title: `${tag} other`,
    });
    courseIds.push(course.courseId, other.courseId);
    await svc
      .from("enrollments")
      .insert({ user_id: l.id, course_id: course.courseId, version_id: course.versionId });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("completes a lesson, persists it, and keeps the first completion time when repeated", async () => {
    currentClient = learner;
    expect(await completeLesson(`${tag}-c`, course.lessonIds[0])).toMatchObject({ completed: true });
    const first = await progressRow(course.lessonIds[0]);
    expect(first?.completed_at).toBeTruthy();

    await new Promise((r) => setTimeout(r, 20));
    expect(await completeLesson(`${tag}-c`, course.lessonIds[0])).toMatchObject({ completed: true });
    expect((await progressRow(course.lessonIds[0]))?.completed_at).toBe(first?.completed_at);
  });

  it("saves the video position and later completion keeps it", async () => {
    currentClient = learner;
    expect(await saveVideoPosition(`${tag}-c`, course.lessonIds[1], 73.8)).toEqual({ saved: true });
    expect((await progressRow(course.lessonIds[1]))?.last_position_seconds).toBe(73);
    expect(await saveVideoPosition(`${tag}-c`, course.lessonIds[1], 80)).toEqual({ saved: true });
    expect((await progressRow(course.lessonIds[1]))?.last_position_seconds).toBe(80);

    await completeLesson(`${tag}-c`, course.lessonIds[1]);
    const row = await progressRow(course.lessonIds[1]);
    expect(row?.completed_at).toBeTruthy();
    expect(row?.last_position_seconds).toBe(80);
  });

  it("rejects invalid positions", async () => {
    currentClient = learner;
    for (const bad of [-5, NaN, 10 ** 9]) {
      expect(await saveVideoPosition(`${tag}-c`, course.lessonIds[0], bad)).toEqual({
        error: "Invalid position.",
      });
    }
  });

  it("refuses learners who are not enrolled", async () => {
    currentClient = outsider;
    expect(await completeLesson(`${tag}-c`, course.lessonIds[0])).toEqual({
      error: "You are not enrolled in this lesson.",
    });
    expect(await saveVideoPosition(`${tag}-c`, course.lessonIds[0], 5)).toEqual({
      error: "You are not enrolled in this lesson.",
    });
  });

  it("refuses a lesson that belongs to a different course", async () => {
    currentClient = learner;
    expect(await completeLesson(`${tag}-c`, other.lessonIds[0])).toEqual({
      error: "You are not enrolled in this lesson.",
    });
    expect(await completeLesson(`${tag}-c`, "not-a-uuid")).toEqual({
      error: "You are not enrolled in this lesson.",
    });
    expect(await completeLesson("Bad Slug!", course.lessonIds[0])).toEqual({
      error: "You are not enrolled in this lesson.",
    });
  });
});
