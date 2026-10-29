import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getIdleUsers, getUserProgress } from "@/features/admin/user-reports";
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

// F-420: user reports (T-275), live Supabase.
describe.skipIf(!hasLiveProject)("user reports (T-275, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("urep");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];

  let admin: SupabaseClient;
  let learnerClient: SupabaseClient;
  let activeLearnerId: string;
  let idleLearnerId: string;
  let courseId: string;

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
      sections: [{ title: "S1", lessons: [{ title: "L1", minutes: 5 }, { title: "L2", minutes: 5 }] }],
    });
    courseId = course.courseId;
    courseIds.push(courseId);

    const active = await createUserWithRole(svc, `${tag}-active`, "learner");
    learnerIds.push(active.id);
    activeLearnerId = active.id;
    learnerClient = await signIn(active.email, active.password);
    const { data: enrollment, error } = await svc
      .from("enrollments")
      .insert({ user_id: active.id, course_id: courseId, version_id: course.versionId })
      .select("id")
      .single();
    if (error) throw error;
    await svc.from("lesson_progress").insert({
      enrollment_id: enrollment.id,
      lesson_id: course.lessonIds[0],
      completed_at: new Date().toISOString(),
    });

    // A learner who joined long ago and has done nothing since.
    const idle = await createUserWithRole(svc, `${tag}-idle`, "learner");
    learnerIds.push(idle.id);
    idleLearnerId = idle.id;
    await svc.from("profiles").update({ created_at: new Date(Date.now() - 200 * 86_400_000).toISOString() }).eq("id", idle.id);
  }, 200_000);

  afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("lists a long-inactive user as idle with the days idle", async () => {
    const rows = await getIdleUsers(admin, 30);
    const row = rows.find((r) => r.userId === idleLearnerId);
    expect(row).toBeDefined();
    expect(row!.daysIdle).toBeGreaterThanOrEqual(199);
    expect(row!.enrollments).toBe(0);
  });

  it("does not list a user with recent activity as idle", async () => {
    const rows = await getIdleUsers(admin, 30);
    expect(rows.some((r) => r.userId === activeLearnerId)).toBe(false);
  });

  it("reports an enrolment's lesson progress and course", async () => {
    const rows = await getUserProgress(admin, 30);
    const row = rows.find((r) => r.userId === activeLearnerId && r.courseId === courseId);
    expect(row).toMatchObject({
      courseTitle: `${tag} Course`,
      enrollmentStatus: "active",
      lessonsCompleted: 1,
      lessonsTotal: 2,
      assessmentsTotal: 0,
      certificateStatus: null,
    });
  });

  it("refuses both reports to a learner without analytics.read", async () => {
    await expect(getIdleUsers(learnerClient, 30)).rejects.toThrow(/not allowed/);
    await expect(getUserProgress(learnerClient, 30)).rejects.toThrow(/not allowed/);
  });
});
