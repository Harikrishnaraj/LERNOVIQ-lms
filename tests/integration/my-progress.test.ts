import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMyProgress } from "@/features/progress/progress";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// F-114: hours, active days, per-course completion and categories come from real lesson completions.
describe.skipIf(!hasLiveProject)("my progress (T-084, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("mp");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let fresh: { id: string; client: SupabaseClient };

  async function user(name: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner");
    learnerIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    learner = await user("lrn");
    other = await user("oth");
    fresh = await user("new");
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(ins.id);
    const { data: cat } = await svc.from("categories").select("id, name").limit(1).single();
    const a = await createCourse(svc, ins.id, {
      slug: `${tag}-a`, title: `${tag} Alpha`, publish: true, categoryId: cat!.id as string,
      sections: [{ title: "S", lessons: [{ title: "A1", minutes: 10 }, { title: "A2", minutes: 20 }, { title: "A3", minutes: 30 }, { title: "A4", minutes: 40 }] }],
    });
    const b = await createCourse(svc, ins.id, {
      slug: `${tag}-b`, title: `${tag} Beta`, publish: true,
      sections: [{ title: "S", lessons: [{ title: "B1", minutes: 5 }, { title: "B2", minutes: 5 }] }],
    });
    courseIds.push(a.courseId, b.courseId);

    const { data: ea } = await svc.from("enrollments").insert({ user_id: learner.id, course_id: a.courseId, version_id: a.versionId }).select("id").single();
    const { data: eb } = await svc.from("enrollments").insert({ user_id: learner.id, course_id: b.courseId, version_id: b.versionId, status: "completed", completed_at: daysAgo(0) }).select("id").single();
    await svc.from("enrollments").insert({ user_id: other.id, course_id: a.courseId, version_id: a.versionId });

    // Alpha: 10-minute lesson today, 20-minute yesterday, 30-minute lesson with no completion; Beta both done today.
    await svc.from("lesson_progress").insert([
      { enrollment_id: ea!.id, lesson_id: a.lessonIds[0], completed_at: daysAgo(0), last_position_seconds: 0 },
      { enrollment_id: ea!.id, lesson_id: a.lessonIds[1], completed_at: daysAgo(1), last_position_seconds: 0 },
      { enrollment_id: ea!.id, lesson_id: a.lessonIds[2], completed_at: null, last_position_seconds: 30 },
      { enrollment_id: eb!.id, lesson_id: b.lessonIds[0], completed_at: daysAgo(0), last_position_seconds: 0 },
      { enrollment_id: eb!.id, lesson_id: b.lessonIds[1], completed_at: daysAgo(0), last_position_seconds: 0 },
    ]);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("adds up minutes and lessons from completed lessons only", async () => {
    const p = await getMyProgress(learner.client);
    expect(p.minutes).toBe(10 + 20 + 5 + 5);
    expect(p.lessonsCompleted).toBe(4);
  });

  it("lists distinct UTC active days, newest first", async () => {
    const p = await getMyProgress(learner.client);
    const today = new Date().toISOString().slice(0, 10);
    expect(p.activeDays).toHaveLength(2);
    expect(p.activeDays[0] >= p.activeDays[1]).toBe(true);
    expect(p.activeDays).toContain(today);
  });

  it("reports per-course completion with category, status and percent", async () => {
    const p = await getMyProgress(learner.client);
    const alpha = p.courses.find((c) => c.title === `${tag} Alpha`)!;
    const beta = p.courses.find((c) => c.title === `${tag} Beta`)!;
    expect(alpha).toMatchObject({ totalLessons: 4, completedLessons: 2, minutes: 30, percent: 50, status: "active" });
    expect(alpha.category).not.toBeNull();
    expect(beta).toMatchObject({ totalLessons: 2, completedLessons: 2, minutes: 10, percent: 100, status: "completed", category: null });
  });

  it("is per learner: another learner and a new learner see only their own data", async () => {
    const o = await getMyProgress(other.client);
    expect(o.minutes).toBe(0);
    expect(o.courses).toHaveLength(1);
    expect(o.courses[0]).toMatchObject({ completedLessons: 0, percent: 0 });
    expect(await getMyProgress(fresh.client)).toEqual({ minutes: 0, lessonsCompleted: 0, activeDays: [], courses: [] });
  });

  it("is not available to anonymous callers", async () => {
    await expect(getMyProgress(anon())).rejects.toThrow();
  });
});
