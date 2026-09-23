import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getCourseDetail } from "@/features/catalog/course-detail";
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

// F-102 data layer, read as an anonymous visitor against the live project.
describe.skipIf(!hasLiveProject)("getCourseDetail (T-033, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const anon = () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
  const tag = uniqueTag("cd");
  const courseIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor", {
      fullName: "Detail Instructor",
    });
    userIds.push(instructor.id);
    const published = await createCourse(svc, instructor.id, {
      slug: `${tag}-pub`,
      title: `${tag} published`,
      subtitle: "A subtitle",
      description: "First paragraph.\n\nSecond paragraph.",
      priceCents: 1900,
      ratingAvg: 4.5,
      ratingCount: 7,
      outcomes: ["Learn A", "Learn B"],
      requirements: ["Req 1"],
      sections: [
        {
          title: "Section one",
          lessons: [
            { title: "Free lesson", type: "video", minutes: 5, preview: true, content: "public" },
            { title: "Locked lesson", type: "text", minutes: 7, content: "SECRET-BODY" },
          ],
        },
        { title: "Section two", lessons: [{ title: "Quiz", type: "quiz", minutes: 3 }] },
      ],
    });
    const draft = await createCourse(svc, instructor.id, {
      slug: `${tag}-draft`,
      title: `${tag} draft`,
      publish: false,
    });
    courseIds.push(published.courseId, draft.courseId);
  }, 60_000);

  afterAll(() => cleanup(svc, { courseIds, userIds }), 60_000);

  it("returns the published course with instructor, rating and ordered curriculum", async () => {
    const detail = await getCourseDetail(anon(), `${tag}-pub`);
    expect(detail).toMatchObject({
      title: `${tag} published`,
      subtitle: "A subtitle",
      priceCents: 1900,
      ratingAvg: 4.5,
      ratingCount: 7,
      instructorName: "Detail Instructor",
      outcomes: ["Learn A", "Learn B"],
      requirements: ["Req 1"],
      durationMinutes: 15,
      lessonCount: 3,
    });
    expect(detail!.sections.map((s) => s.title)).toEqual(["Section one", "Section two"]);
    expect(detail!.sections[0].lessons.map((l) => [l.title, l.isPreview])).toEqual([
      ["Free lesson", true],
      ["Locked lesson", false],
    ]);
  });

  it("never exposes lesson content in the outline", async () => {
    const detail = await getCourseDetail(anon(), `${tag}-pub`);
    expect(JSON.stringify(detail)).not.toContain("SECRET-BODY");
  });

  it("returns null for an unpublished course, an unknown slug and an invalid slug", async () => {
    expect(await getCourseDetail(anon(), `${tag}-draft`)).toBeNull();
    expect(await getCourseDetail(anon(), `${tag}-nope`)).toBeNull();
    expect(await getCourseDetail(anon(), "Not A Slug; drop table")).toBeNull();
  });
});
