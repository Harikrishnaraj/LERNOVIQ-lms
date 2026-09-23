import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getLessonContent, getPlayerCourse } from "@/features/player/data";
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

// TEST_PLAN section 6: who can read which lesson, and which version.
describe.skipIf(!hasLiveProject)("player access (T-036, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("pa");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let enrolled: { id: string; client: SupabaseClient };
  let outsider: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let v2LessonId: string;

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
    const ue = await createUserWithRole(svc, `${tag}-e`, "learner");
    const uo = await createUserWithRole(svc, `${tag}-o`, "learner");
    learnerIds.push(ue.id, uo.id);
    enrolled = { id: ue.id, client: await signIn(ue.email) };
    outsider = { id: uo.id, client: await signIn(uo.email) };

    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} v1 title`,
      sections: [
        {
          title: "S",
          lessons: [
            { title: "Preview", preview: true, content: "<p>free</p>" },
            { title: "Locked", content: "<p>SECRET-V1</p>" },
          ],
        },
      ],
    });
    courseIds.push(course.courseId);
    await enrolled.client
      .from("enrollments")
      .insert({ user_id: enrolled.id, course_id: course.courseId, version_id: course.versionId });

    // Next draft version with its own lesson: the enrolled learner must not see it.
    const { data: v2 } = await svc
      .from("course_versions")
      .insert({ course_id: course.courseId, version_number: 2, title: `${tag} v2 draft` })
      .select("id")
      .single();
    const { data: sec } = await svc
      .from("course_sections")
      .insert({ version_id: v2!.id, title: "Draft section", position: 0 })
      .select("id")
      .single();
    const { data: les } = await svc
      .from("lessons")
      .insert({ section_id: sec!.id, title: "Draft lesson", content: "<p>SECRET-V2</p>" })
      .select("id")
      .single();
    v2LessonId = les!.id;
  }, 60_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 60_000);

  it("gives an enrolled learner the full enrolled version with locked lessons readable", async () => {
    const player = await getPlayerCourse(enrolled.client, enrolled.id, `${tag}-c`);
    expect(player).toMatchObject({ enrolled: true, title: `${tag} v1 title`, versionId: course.versionId });
    expect(player!.sections[0].lessons.map((l) => l.title)).toEqual(["Preview", "Locked"]);
    const locked = await getLessonContent(enrolled.client, course.lessonIds[1]);
    expect(locked?.content).toContain("SECRET-V1");
  });

  it("never lets an enrolled learner read another (draft) version of the course", async () => {
    expect(await getLessonContent(enrolled.client, v2LessonId)).toBeNull();
    const versions = await enrolled.client.from("course_versions").select("id, title");
    expect(JSON.stringify(versions.data)).not.toContain("v2 draft");
  });

  it("shows a non-enrolled learner the outline but only the preview lesson body", async () => {
    const player = await getPlayerCourse(outsider.client, outsider.id, `${tag}-c`);
    expect(player).toMatchObject({ enrolled: false });
    expect(player!.sections[0].lessons.map((l) => [l.title, l.isPreview])).toEqual([
      ["Preview", true],
      ["Locked", false],
    ]);
    expect((await getLessonContent(outsider.client, course.lessonIds[0]))?.content).toContain("free");
    expect(await getLessonContent(outsider.client, course.lessonIds[1])).toBeNull();
  });

  it("does not resolve a draft-only course for a stranger", async () => {
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const draft = await createCourse(svc, userIds[0], {
      slug: `${tag}-draft`,
      title: `${tag} draft only`,
      publish: false,
    });
    courseIds.push(draft.courseId);
    expect(await getPlayerCourse(anon, null, `${tag}-draft`)).toBeNull();
    expect(await getPlayerCourse(outsider.client, outsider.id, `${tag}-draft`)).toBeNull();
  });

  it("keeps an enrolled learner in the course after it is unpublished", async () => {
    await svc.from("courses").update({ published_version_id: null }).eq("id", course.courseId);
    const player = await getPlayerCourse(enrolled.client, enrolled.id, `${tag}-c`);
    expect(player?.enrolled).toBe(true);
    const stranger = await getPlayerCourse(outsider.client, outsider.id, `${tag}-c`);
    expect(stranger).toBeNull();
  });
});
