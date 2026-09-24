import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCoursePreview } from "@/features/course-authoring/preview";
import { getLessonContent } from "@/features/player/data";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-208: the owner sees an unpublished draft exactly as the player would load it; nobody else does.
describe.skipIf(!hasLiveProject)("course preview (T-056, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("pv");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let draft: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    draft = await createCourse(svc, owner.id, {
      slug: `${tag}-d`,
      title: `${tag} Draft`,
      publish: false,
      sections: [
        { title: "One", lessons: [{ title: "First", minutes: 5 }, { title: "Second", minutes: 7, content: "<p>Body two</p>" }] },
        { title: "Two", lessons: [{ title: "Third", minutes: 3 }] },
      ],
    });
    courseIds.push(draft.courseId);
  }, 90_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 60_000);

  it("gives the owner the full draft outline in order, nothing locked", async () => {
    const p = await getCoursePreview(owner.client, owner.id, draft.courseId);
    expect(p?.title).toBe(`${tag} Draft`);
    expect(p!.sections.map((s) => s.lessons.map((l) => l.title))).toEqual([["First", "Second"], ["Third"]]);
  });

  it("lets the owner read a draft lesson body", async () => {
    const lesson = await getLessonContent(owner.client, draft.lessonIds[1]);
    expect(lesson?.content).toBe("<p>Body two</p>");
  });

  it("refuses other instructors and learners", async () => {
    expect(await getCoursePreview(other.client, other.id, draft.courseId)).toBeNull();
    expect(await getCoursePreview(learner.client, learner.id, draft.courseId)).toBeNull();
    expect(await getLessonContent(learner.client, draft.lessonIds[1])).toBeNull();
  });

  it("returns null for malformed and unknown ids", async () => {
    expect(await getCoursePreview(owner.client, owner.id, "not-a-uuid")).toBeNull();
    expect(await getCoursePreview(owner.client, owner.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("shows a course with no lessons as an empty outline", async () => {
    const empty = await createCourse(svc, owner.id, { slug: `${tag}-e`, title: `${tag} Empty`, publish: false, sections: [] });
    courseIds.push(empty.courseId);
    const p = await getCoursePreview(owner.client, owner.id, empty.courseId);
    expect(p?.sections).toEqual([]);
  });
});
