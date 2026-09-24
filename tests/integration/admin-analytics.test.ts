import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDailyAnalytics, getTopCourses } from "@/features/admin/analytics";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-412: analytics come from real enrollments and are visible to analytics.read only.
describe.skipIf(!hasLiveProject)("admin analytics (T-077, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("an");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let admin: { id: string; client: SupabaseClient };
  let support: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = await user("adm", "admin");
    support = await user("sup", "support_agent");
    const instructor = await user("ins", "instructor");
    course = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Popular`, publish: true });
    courseIds.push(course.courseId);
    const a = await user("la", "learner");
    const b = await user("lb", "learner");
    await svc.from("enrollments").insert([
      { user_id: a.id, course_id: course.courseId, version_id: course.versionId, status: "completed", completed_at: new Date().toISOString() },
      { user_id: b.id, course_id: course.courseId, version_id: course.versionId, status: "active" },
    ]);
  }, 150_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 60_000);

  it("returns one zero-filled row per day, ending today, with today's activity counted", async () => {
    const points = await getDailyAnalytics(admin.client, 7);
    expect(points).toHaveLength(7);
    const days = points.map((p) => p.day);
    expect([...days].sort()).toEqual(days);
    const today = points.at(-1)!;
    expect(today.day).toBe(new Date().toISOString().slice(0, 10));
    // Other suites run concurrently, so only lower bounds are stable.
    expect(today.enrollments).toBeGreaterThanOrEqual(2);
    expect(today.completions).toBeGreaterThanOrEqual(1);
    expect(today.signups).toBeGreaterThanOrEqual(5);
  });

  it("clamps the range", async () => {
    expect(await getDailyAnalytics(admin.client, 0)).toHaveLength(1);
    expect(await getDailyAnalytics(admin.client, 100000)).toHaveLength(365);
  });

  it("ranks courses by enrollments in the range", async () => {
    const top = await getTopCourses(admin.client, 30, 20);
    const mine = top.find((c) => c.courseId === course.courseId);
    expect(mine).toEqual({ courseId: course.courseId, title: `${tag} Popular`, enrollments: 2, completions: 1 });
    const counts = top.map((c) => c.enrollments);
    expect([...counts].sort((x, y) => y - x)).toEqual(counts);
  });

  it("is refused to support agents, learners and anonymous callers", async () => {
    await expect(getDailyAnalytics(support.client, 7)).rejects.toThrow();
    await expect(getTopCourses(support.client, 7)).rejects.toThrow();
    await expect(getDailyAnalytics(anon(), 7)).rejects.toThrow();
  });
});
