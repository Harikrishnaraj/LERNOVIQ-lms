import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMyStudents } from "@/features/instructor/students";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// F-213: the instructor sees only learners in their own courses, with real progress and segments.
describe.skipIf(!hasLiveProject)("instructor students (T-103, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("is");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let teacher: U, other: U, learner: U;
  const names = ["Newby New", "Steady Sam", "Flo Fading", "Cora Complete", "Cancel Carl"];

  async function user(name: string, role: string, fullName?: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    if (fullName) await svc.from("profiles").update({ full_name: fullName }).eq("id", u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    teacher = await user("tch", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    const c = await createCourse(svc, teacher.id, {
      slug: `${tag}-c`, title: `${tag} Course`, publish: true,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }, { title: "L3" }, { title: "L4" }] }],
    });
    const oc = await createCourse(svc, other.id, { slug: `${tag}-o`, title: `${tag} Other`, publish: true });
    courseIds.push(c.courseId, oc.courseId);

    const students: { name: string; enrolled: string; done: number; lastActive: string | null; status?: string }[] = [
      { name: names[0], enrolled: daysAgo(1), done: 0, lastActive: null },
      { name: names[1], enrolled: daysAgo(30), done: 3, lastActive: daysAgo(2) },
      { name: names[2], enrolled: daysAgo(40), done: 1, lastActive: daysAgo(25) },
      { name: names[3], enrolled: daysAgo(30), done: 4, lastActive: daysAgo(5), status: "completed" },
      { name: names[4], enrolled: daysAgo(3), done: 0, lastActive: null, status: "cancelled" },
    ];
    for (const s of students) {
      const u = await user(s.name.replace(/\W/g, "").toLowerCase(), "learner", s.name);
      const { data: e } = await svc
        .from("enrollments")
        .insert({ user_id: u.id, course_id: c.courseId, version_id: c.versionId, enrolled_at: s.enrolled, status: s.status ?? "active", completed_at: s.status === "completed" ? daysAgo(5) : null })
        .select("id")
        .single();
      if (s.done > 0) {
        await svc.from("lesson_progress").insert(
          c.lessonIds.slice(0, s.done).map((lesson_id) => ({ enrollment_id: e!.id, lesson_id, completed_at: s.lastActive, last_position_seconds: 0, updated_at: s.lastActive })),
        );
      }
    }
    // A learner in the other instructor's course.
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: oc.courseId, version_id: oc.versionId });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("lists learners in the instructor's own courses with progress and segments, cancelled excluded", async () => {
    const rows = await getMyStudents(teacher.client);
    const mine = rows.filter((r) => r.courseTitle === `${tag} Course`);
    expect(mine.map((r) => r.name).sort()).toEqual(names.slice(0, 4).sort());
    const by = Object.fromEntries(mine.map((r) => [r.name, r]));
    expect(by["Newby New"]).toMatchObject({ segment: "just_enrolled", completedLessons: 0, totalLessons: 4, percent: 0 });
    expect(by["Steady Sam"]).toMatchObject({ segment: "on_track", completedLessons: 3, percent: 75 });
    expect(by["Flo Fading"]).toMatchObject({ segment: "at_risk", completedLessons: 1, percent: 25 });
    expect(by["Cora Complete"]).toMatchObject({ segment: "completed", completedLessons: 4, percent: 100 });
    expect(by["Steady Sam"].lastActivityAt).not.toBeNull();
    expect(by["Newby New"].lastActivityAt).toBeNull();
  });

  it("never returns emails or other instructors' learners", async () => {
    const rows = await getMyStudents(teacher.client);
    expect(JSON.stringify(rows)).not.toContain("@example.com");
    expect(rows.every((r) => r.courseTitle !== `${tag} Other`)).toBe(true);
    const theirs = await getMyStudents(other.client);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({ courseTitle: `${tag} Other`, name: "A learner", segment: "just_enrolled" });
  });

  it("gives learners and anonymous callers nothing", async () => {
    expect(await getMyStudents(learner.client)).toEqual([]);
    await expect(getMyStudents(anon())).rejects.toThrow();
  });
});
