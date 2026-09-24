import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { evaluateReadiness, getReadinessSnapshot } from "@/features/course-authoring/readiness";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-209: the snapshot loaded from the database drives the same rules the unit tests cover.
describe.skipIf(!hasLiveProject)("readiness snapshot (T-057, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("rd");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;

  beforeAll(async () => {
    const u = await createUserWithRole(svc, `${tag}-own`, "instructor");
    userIds.push(u.id);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    owner = { id: u.id, client };
    course = await createCourse(svc, u.id, {
      slug: `${tag}-c`,
      title: `${tag} Course`,
      publish: false,
      sections: [
        { title: "Main", lessons: [{ title: "Filled", type: "text", content: "<p>Body</p>" }, { title: "Blank", type: "text", content: "" }] },
        { title: "Empty", lessons: [] },
      ],
    });
    courseIds.push(course.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }), 120_000);

  it("reads the real course and reports what is missing", async () => {
    const snap = await getReadinessSnapshot(owner.client, course.versionId, null);
    expect(snap?.sections.map((s) => s.lessons.length)).toEqual([2, 0]);
    const ids = evaluateReadiness(snap!).missing.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["description", "category", "thumbnail", "outcomes", "empty-sections", "lesson-content", "assessment"]));
  });

  it("counts assessment questions and turns green once everything is filled in", async () => {
    await createAssessment(svc, course.versionId, { title: "Empty quiz", questions: [] });
    let snap = await getReadinessSnapshot(owner.client, course.versionId, null);
    expect(snap!.assessments).toEqual([{ id: expect.any(String), title: "Empty quiz", questionCount: 0 }]);
    expect(evaluateReadiness(snap!).missing.map((m) => m.id)).toContain("questions");

    await svc.from("assessments").delete().eq("version_id", course.versionId);
    await createAssessment(svc, course.versionId, {
      title: "Real quiz",
      questions: [{ type: "true_false", prompt: "True?", options: ["True", "False"], correct: [0] }],
    });
    await svc.from("course_sections").delete().eq("version_id", course.versionId).eq("title", "Empty");
    await svc.from("lessons").update({ content: "<p>Now filled</p>" }).eq("title", "Blank").in("id", course.lessonIds);
    await svc.from("course_versions").update({
      description: "A complete description that is comfortably longer than the fifty character minimum.",
      outcomes: ["Learn things"],
      thumbnail_url: "https://example.com/t.png",
    }).eq("id", course.versionId);

    snap = await getReadinessSnapshot(owner.client, course.versionId, "programming");
    const report = evaluateReadiness(snap!);
    expect(report.missing).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it("returns null for a version the caller cannot read", async () => {
    const stranger = await createUserWithRole(svc, `${tag}-str`, "instructor");
    userIds.push(stranger.id);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: stranger.email, password: stranger.password });
    // A draft version is invisible to other instructors under RLS.
    expect(await getReadinessSnapshot(client, course.versionId, null)).toBeNull();
  });
});
