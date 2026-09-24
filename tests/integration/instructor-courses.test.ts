import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getInstructorCourses } from "@/features/instructor/courses";
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

// F-201: only the caller own courses come back, with the status of the latest version.
describe.skipIf(!hasLiveProject)("instructor_courses (T-050, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ic");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let a: { id: string; client: SupabaseClient };
  let b: { id: string; client: SupabaseClient };
  let admin: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    a = await user("a", "instructor");
    b = await user("b", "instructor");
    admin = await user("adm", "admin");
    const learner1 = await user("l1", "learner");
    const learner2 = await user("l2", "learner");

    const live = await createCourse(svc, a.id, { slug: `${tag}-live`, title: `${tag} Live`, ratingAvg: 4.5, ratingCount: 2 });
    const draft = await createCourse(svc, a.id, { slug: `${tag}-draft`, title: `${tag} Draft`, publish: false });
    const other = await createCourse(svc, b.id, { slug: `${tag}-other`, title: `${tag} Other`, publish: false });
    courseIds.push(live.courseId, draft.courseId, other.courseId);

    // Live course gets a newer draft version 2: the list must show the LATEST version status.
    await svc
      .from("course_versions")
      .insert({ course_id: live.courseId, version_number: 2, title: `${tag} Live v2`, status: "changes_requested" });

    const { error: enrollError } = await svc.from("enrollments").insert([
      { user_id: learner1.id, course_id: live.courseId, version_id: live.versionId, status: "completed" },
      { user_id: learner2.id, course_id: live.courseId, version_id: live.versionId, status: "active" },
    ]);
    if (enrollError) throw enrollError;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("returns only the caller own courses", async () => {
    const mine = await getInstructorCourses(a.client);
    expect(mine.map((c) => c.slug).sort()).toEqual([`${tag}-draft`, `${tag}-live`]);
    const theirs = await getInstructorCourses(b.client);
    expect(theirs.map((c) => c.slug)).toEqual([`${tag}-other`]);
  });

  it("shows the latest version status, live flag, counts and rating", async () => {
    const live = (await getInstructorCourses(a.client)).find((c) => c.slug === `${tag}-live`)!;
    expect(live).toMatchObject({
      title: `${tag} Live v2`,
      status: "changes_requested",
      versionNumber: 2,
      versionCount: 2,
      isLive: true,
      learners: 2,
      completions: 1,
      ratingAvg: 4.5,
      ratingCount: 2,
    });
    const draft = (await getInstructorCourses(a.client)).find((c) => c.slug === `${tag}-draft`)!;
    expect(draft).toMatchObject({ status: "draft", isLive: false, learners: 0 });
  });

  it("never leaks courses to staff either: it is always the caller own list", async () => {
    expect(await getInstructorCourses(admin.client)).toEqual([]);
  });

  it("is not callable anonymously", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await anon.rpc("instructor_courses");
    expect(error).not.toBeNull();
  });
});
