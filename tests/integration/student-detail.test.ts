import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStudentDetail } from "@/features/instructor/student-detail";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-213: per-student detail is visible to the course owner only.
describe.skipIf(!hasLiveProject)("student detail (T-104, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("sd");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let teacher: U, other: U, learner: U;
  let enrollmentId = "";

  async function user(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    teacher = await user("tch", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    await svc.from("profiles").update({ full_name: "Detail Dana" }).eq("id", learner.id);
    const c = await createCourse(svc, teacher.id, {
      slug: `${tag}-c`, title: `${tag} Course`, publish: true,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }] }],
    });
    courseIds.push(c.courseId);
    const { data: e } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId })
      .select("id")
      .single();
    enrollmentId = e!.id;
    await svc.from("lesson_progress").insert({ enrollment_id: enrollmentId, lesson_id: c.lessonIds[0], completed_at: new Date().toISOString(), last_position_seconds: 0 });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("gives the course owner per-lesson progress", async () => {
    const d = await getStudentDetail(teacher.client, enrollmentId);
    expect(d).toMatchObject({ name: "Detail Dana", completedLessons: 1, percent: 50, attempts: [], submissions: [] });
    expect(d!.lessons.map((l) => l.state)).toEqual(["completed", "not_started"]);
    expect(JSON.stringify(d)).not.toContain("@example.com");
  });

  it("returns nothing to another instructor or the learner, and rejects anonymous callers", async () => {
    expect(await getStudentDetail(other.client, enrollmentId)).toBeNull();
    expect(await getStudentDetail(learner.client, enrollmentId)).toBeNull();
    await expect(getStudentDetail(anon(), enrollmentId)).rejects.toThrow();
  });

  it("treats malformed and unknown ids as not found", async () => {
    expect(await getStudentDetail(teacher.client, "not-a-uuid")).toBeNull();
    expect(await getStudentDetail(teacher.client, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
