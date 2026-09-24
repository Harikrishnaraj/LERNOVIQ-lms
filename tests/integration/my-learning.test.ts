import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMyLearning, getSavedCourses } from "@/features/my-learning/queries";
import {
  cleanup,
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

// T-035 data layer + the ADR-011 guarantee that an enrolled learner keeps their version.
describe.skipIf(!hasLiveProject)("my learning + saved courses (T-035, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("mi");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let a: { id: string; client: SupabaseClient };
  let b: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let draft: Awaited<ReturnType<typeof createCourse>>;

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

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    const ua = await createUserWithRole(svc, `${tag}-a`, "learner");
    const ub = await createUserWithRole(svc, `${tag}-b`, "learner");
    learnerIds.push(ua.id, ub.id);
    a = { id: ua.id, client: await signIn(ua.email) };
    b = { id: ub.id, client: await signIn(ub.email) };

    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      sections: [{ title: "S", lessons: [{ title: "L1" }, { title: "L2" }, { title: "L3" }] }],
    });
    draft = await createCourse(svc, instructor.id, {
      slug: `${tag}-d`,
      title: `${tag} draft`,
      publish: false,
    });
    courseIds.push(course.courseId, draft.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("reports lessons and progress for the caller only", async () => {
    const { data: enr } = await a.client
      .from("enrollments")
      .insert({ user_id: a.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    await a.client.from("lesson_progress").insert({
      enrollment_id: enr!.id,
      lesson_id: course.lessonIds[0],
      completed_at: new Date().toISOString(),
    });

    const mine = await getMyLearning(a.client);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      slug: `${tag}-c`,
      totalLessons: 3,
      completedLessons: 1,
      percent: 33,
      status: "active",
    });
    expect(await getMyLearning(b.client)).toEqual([]);
  });

  it("keeps the enrolled version readable after a newer version is published", async () => {
    // Publish a v2 and move the live pointer; the learner stays on v1.
    const { data: v2 } = await svc
      .from("course_versions")
      .insert({
        course_id: course.courseId,
        version_number: 2,
        title: `${tag} v2`,
        status: "published",
      })
      .select("id")
      .single();
    await svc.from("courses").update({ published_version_id: v2!.id }).eq("id", course.courseId);
    await svc.from("course_versions").update({ status: "archived" }).eq("id", course.versionId);

    const asEnrolled = await a.client
      .from("course_versions")
      .select("id")
      .eq("id", course.versionId);
    expect(asEnrolled.data).toHaveLength(1);
    const sections = await a.client
      .from("course_sections")
      .select("id")
      .eq("version_id", course.versionId);
    expect(sections.data).toHaveLength(1);

    const asOther = await b.client.from("course_versions").select("id").eq("id", course.versionId);
    expect(asOther.data).toEqual([]);
  });

  it("lets a learner save and unsave a published course, privately", async () => {
    const save = await a.client
      .from("saved_courses")
      .insert({ user_id: a.id, course_id: course.courseId });
    expect(save.error).toBeNull();
    expect((await getSavedCourses(a.client)).map((s) => s.slug)).toEqual([`${tag}-c`]);
    expect(await getSavedCourses(b.client)).toEqual([]);
    const otherSees = await b.client.from("saved_courses").select("course_id");
    expect(otherSees.data).toEqual([]);

    await a.client.from("saved_courses").delete().eq("course_id", course.courseId);
    expect(await getSavedCourses(a.client)).toEqual([]);
  });

  it("refuses saving an unpublished course or saving as someone else", async () => {
    const unpublished = await a.client
      .from("saved_courses")
      .insert({ user_id: a.id, course_id: draft.courseId });
    expect(unpublished.error).not.toBeNull();
    const asOther = await a.client
      .from("saved_courses")
      .insert({ user_id: b.id, course_id: course.courseId });
    expect(asOther.error).not.toBeNull();
  });

  it("does not expose my_learning to anonymous callers", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await anon.rpc("my_learning");
    expect(error).not.toBeNull();
  });
});
