import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getUserProductDuration } from "@/features/admin/user-reports";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// F-420: learning-time tracking and the User product duration report (T-292), live Supabase.
describe.skipIf(!hasLiveProject)("learning time (T-292, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ltime");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: SupabaseClient;
  let learner: SupabaseClient;
  let outsider: SupabaseClient;
  let learnerId: string;
  let enrollmentId: string;
  let lessonId: string;

  async function signIn(email: string, password: string) {
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  beforeAll(async () => {
    const adminUser = await createUserWithRole(svc, `${tag}-admin`, "admin");
    userIds.push(adminUser.id);
    admin = await signIn(adminUser.email, adminUser.password);

    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
      sections: [{ title: "S1", lessons: [{ title: "L1", minutes: 5 }] }],
    });
    courseIds.push(course.courseId);
    lessonId = course.lessonIds[0];

    const a = await createUserWithRole(svc, `${tag}-la`, "learner");
    const b = await createUserWithRole(svc, `${tag}-lb`, "learner");
    learnerIds.push(a.id, b.id);
    learnerId = a.id;
    learner = await signIn(a.email, a.password);
    outsider = await signIn(b.email, b.password); // not enrolled
    const { data, error } = await svc
      .from("enrollments")
      .insert({ user_id: a.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    if (error) throw error;
    enrollmentId = data.id;
  }, 200_000);

  afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("credits the first heartbeat, capped at 60 seconds", async () => {
    const { data, error } = await learner.rpc("record_lesson_time", { p_lesson_id: lessonId, p_seconds: 600 });
    expect(error).toBeNull();
    expect(data).toBe(60);
  });

  it("credits no more than the real time since the last heartbeat", async () => {
    const { data } = await learner.rpc("record_lesson_time", { p_lesson_id: lessonId, p_seconds: 60 });
    expect(data).toBeLessThanOrEqual(10); // the previous call was moments ago
  });

  it("refuses a learner who is not enrolled in the lesson's course", async () => {
    const { error } = await outsider.rpc("record_lesson_time", { p_lesson_id: lessonId, p_seconds: 30 });
    expect(error?.message).toMatch(/not allowed/);
  });

  it("does not let a learner read or write lesson_time directly", async () => {
    const read = await learner.from("lesson_time").select("seconds");
    expect(read.data ?? []).toHaveLength(0);
    const write = await learner
      .from("lesson_time")
      .insert({ enrollment_id: enrollmentId, lesson_id: lessonId, day: "2026-01-01", seconds: 999999 });
    expect(write.error).not.toBeNull();
  });

  it("reports the recorded time per learner and course to an admin, and refuses a learner", async () => {
    const rows = await getUserProductDuration(admin, 7);
    const mine = rows.find((r) => r.userId === learnerId);
    expect(mine).toMatchObject({ courseTitle: `${tag} Course`, lessonsWithTime: 1, activeDays: 1 });
    expect(mine!.totalSeconds).toBeGreaterThanOrEqual(60);
    expect(mine!.totalSeconds).toBeLessThanOrEqual(75);
    await expect(getUserProductDuration(learner, 7)).rejects.toThrow(/not allowed/);
  });
});
