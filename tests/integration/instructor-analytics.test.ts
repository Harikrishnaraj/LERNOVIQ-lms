import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getInstructorCourses,
  getInstructorCoursesBreakdown,
  getInstructorDailyAnalytics,
  summarizeInstructorAnalytics,
} from "@/features/instructor/analytics";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-216: Instructor analytics (TEST_PLAN §12: metrics load, date filters work, course filter works, unauthorized course data is not returned)
describe.skipIf(!hasLiveProject)("instructor analytics (T-107, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ina");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

  let teacherA: { id: string; client: SupabaseClient };
  let teacherB: { id: string; client: SupabaseClient };
  let courseA: Awaited<ReturnType<typeof createCourse>>;
  let courseB: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    teacherA = await user("tcha", "instructor");
    teacherB = await user("tchb", "instructor");

    courseA = await createCourse(svc, teacherA.id, {
      slug: `${tag}-course-a`,
      title: `${tag} Analytics 101`,
      publish: true,
    });
    courseIds.push(courseA.courseId);

    // Update course version price
    await svc
      .from("course_versions")
      .update({ price_cents: 2500 })
      .eq("id", courseA.versionId);

    courseB = await createCourse(svc, teacherB.id, {
      slug: `${tag}-course-b`,
      title: `${tag} Teacher B Course`,
      publish: true,
    });
    courseIds.push(courseB.courseId);

    const l1 = await user("l1", "learner");
    const l2 = await user("l2", "learner");

    // Enrollments for teacherA's course
    await svc.from("enrollments").insert({
      user_id: l1.id,
      course_id: courseA.courseId,
      version_id: courseA.versionId,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    const { data: e2 } = await svc
      .from("enrollments")
      .insert({
        user_id: l2.id,
        course_id: courseA.courseId,
        version_id: courseA.versionId,
        status: "active",
      })
      .select("id")
      .single();

    // Lesson progress for active learner
    await svc.from("lesson_progress").insert({
      enrollment_id: e2!.id,
      lesson_id: courseA.lessonIds[0],
      completed_at: null,
      last_position_seconds: 45,
      updated_at: new Date().toISOString(),
    });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("lists courses owned by the authenticated instructor", async () => {
    const courses = await getInstructorCourses(teacherA.client);
    expect(courses.some((c) => c.id === courseA.courseId)).toBe(true);
    // Should NOT contain teacherB's course
    expect(courses.some((c) => c.id === courseB.courseId)).toBe(false);
  });

  it("returns zero-filled daily points for date range with today's enrollments and completions", async () => {
    const points = await getInstructorDailyAnalytics(teacherA.client, 7);
    expect(points).toHaveLength(7);
    const today = points.at(-1)!;
    expect(today.day).toBe(new Date().toISOString().slice(0, 10));
    expect(today.enrollments).toBeGreaterThanOrEqual(2);
    expect(today.completions).toBeGreaterThanOrEqual(1);
    expect(today.activeLearners).toBeGreaterThanOrEqual(2);
    expect(today.revenueCents).toBeGreaterThanOrEqual(5000); // 2 * $25
  });

  it("filters daily analytics by course", async () => {
    const pointsA = await getInstructorDailyAnalytics(teacherA.client, 7, courseA.courseId);
    expect(pointsA).toHaveLength(7);
    const today = pointsA.at(-1)!;
    expect(today.enrollments).toBeGreaterThanOrEqual(2);
  });

  it("returns course breakdown scoped to instructor's courses", async () => {
    const breakdown = await getInstructorCoursesBreakdown(teacherA.client, 30);
    const item = breakdown.find((b) => b.courseId === courseA.courseId);
    expect(item).toBeDefined();
    expect(item!.enrollments).toBeGreaterThanOrEqual(2);
    expect(item!.completions).toBeGreaterThanOrEqual(1);
    expect(item!.completionRate).toBeGreaterThanOrEqual(50);
    expect(item!.activeLearners).toBeGreaterThanOrEqual(2);
    expect(item!.revenueCents).toBeGreaterThanOrEqual(5000);
  });

  it("does NOT return unauthorized course data (TEST_PLAN §12)", async () => {
    // Teacher B queries Teacher A's course ID
    const points = await getInstructorDailyAnalytics(teacherB.client, 7, courseA.courseId);
    expect(points).toHaveLength(0);

    const breakdown = await getInstructorCoursesBreakdown(teacherB.client, 30, courseA.courseId);
    expect(breakdown).toHaveLength(0);
  });

  it("summarizes instructor totals accurately", async () => {
    const points = await getInstructorDailyAnalytics(teacherA.client, 7, courseA.courseId);
    const breakdown = await getInstructorCoursesBreakdown(teacherA.client, 7, courseA.courseId);
    const summary = summarizeInstructorAnalytics(points, breakdown);

    expect(summary.totalEnrollments).toBeGreaterThanOrEqual(2);
    expect(summary.totalCompletions).toBeGreaterThanOrEqual(1);
    expect(summary.completionRate).toBeGreaterThanOrEqual(50);
    expect(summary.activeLearners).toBeGreaterThanOrEqual(2);
    expect(summary.totalRevenueCents).toBeGreaterThanOrEqual(5000);
  });

  it("rejects anonymous callers", async () => {
    await expect(getInstructorCourses(anon())).rejects.toThrow();
    await expect(getInstructorDailyAnalytics(anon(), 7)).rejects.toThrow();
    await expect(getInstructorCoursesBreakdown(anon(), 7)).rejects.toThrow();
  });
});
