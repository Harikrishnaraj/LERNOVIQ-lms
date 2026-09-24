import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDashboardData } from "@/features/dashboard/data";
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

// F-100: every block comes from the learner own data.
describe.skipIf(!hasLiveProject)("dashboard data (T-042, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("db");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let learner: { id: string; email: string; client: SupabaseClient };
  let empty: { id: string; email: string; client: SupabaseClient };

  async function user(name: string, fullName?: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner", { fullName });
    learnerIds.push(u.id);
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, email: u.email, client };
  }

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    learner = await user("l", "Grace Hopper");
    empty = await user("e");
    await svc
      .from("learner_onboarding")
      .update({ interests: ["design"] })
      .eq("user_id", learner.id);

    const { data: cat } = await svc
      .from("categories")
      .upsert({ slug: "design", name: "Design", sort_order: 2 }, { onConflict: "slug" })
      .select("id")
      .single();

    // Enrolled course with 2 lessons (1 done today) and a pending assessment.
    const enrolled = await createCourse(svc, instructor.id, {
      slug: `${tag}-enrolled`,
      title: `${tag} Enrolled`,
      sections: [{ title: "S", lessons: [{ title: "First" }, { title: "Second", minutes: 7 }] }],
    });
    // Recommendation candidates: one in the learner interest category, one elsewhere, one owned.
    const rec = await createCourse(svc, instructor.id, {
      slug: `${tag}-rec`,
      title: `${tag} Rec Design`,
      categoryId: cat!.id,
      ratingAvg: 4.9,
      ratingCount: 99,
    });
    courseIds.push(enrolled.courseId, rec.courseId);

    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: enrolled.courseId, version_id: enrolled.versionId })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({
      enrollment_id: enr!.id,
      lesson_id: enrolled.lessonIds[0],
      completed_at: new Date().toISOString(),
    });
    await createAssessment(svc, enrolled.versionId, {
      title: `${tag} Quiz`,
      maxAttempts: 2,
      questions: [{ type: "mcq", prompt: "Q", options: ["a", "b"], correct: [0] }],
    });
  }, 90_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 60_000);

  it("builds every block from the learner own data", async () => {
    const data = await getDashboardData(learner.client, { id: learner.id, email: learner.email });
    expect(data.name).toBe("Grace");
    expect(data.inProgressCount).toBe(1);
    expect(data.continueLearning).toMatchObject({
      slug: `${tag}-enrolled`,
      completedLessons: 1,
      totalLessons: 2,
      percent: 50,
    });
    expect(data.completedToday).toBe(1);
    expect(data.nextUp).toHaveLength(1);
    expect(data.nextUp[0]).toMatchObject({ courseSlug: `${tag}-enrolled`, lessonTitle: "Second", minutes: 7 });
    expect(data.upcomingAssessments).toEqual([
      expect.objectContaining({ title: `${tag} Quiz`, courseSlug: `${tag}-enrolled`, inProgress: false }),
    ]);
  });

  it("recommends unowned courses, leading with the learner interest", async () => {
    const data = await getDashboardData(learner.client, { id: learner.id, email: learner.email });
    const slugs = data.recommendations.map((r) => r.slug);
    expect(slugs).toContain(`${tag}-rec`);
    expect(slugs).not.toContain(`${tag}-enrolled`);
    expect(data.recommendations.length).toBeLessThanOrEqual(3);
  });

  it("returns empty blocks for a learner with no activity", async () => {
    const data = await getDashboardData(empty.client, { id: empty.id, email: empty.email });
    expect(data).toMatchObject({
      continueLearning: null,
      inProgressCount: 0,
      completedToday: 0,
      nextUp: [],
      upcomingAssessments: [],
    });
    expect(data.name).toBe(empty.email.split("@")[0]);
  });

  it("never mixes in another learner data", async () => {
    const data = await getDashboardData(empty.client, { id: empty.id, email: empty.email });
    expect(JSON.stringify(data)).not.toContain(`${tag}-enrolled`);
  });
});
