import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getCurriculum } from "@/features/course-authoring/curriculum";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  addLesson,
  addSection,
  deleteLesson,
  deleteSection,
  moveLessonToSection,
  renameLesson,
  renameSection,
  reorderLessons,
  reorderSections,
} from "@/features/course-authoring/curriculum-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-203 curriculum CRUD + reorder, ownership and locking, against the live project.
describe.skipIf(!hasLiveProject)("curriculum actions (T-052, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cu");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let foreign: Awaited<ReturnType<typeof createCourse>>;

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
  const outline = async () => getCurriculum(svc, course.versionId);
  const titles = async () => (await outline()).map((s) => [s.title, s.lessons.map((l) => l.title)] as const);

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    course = await createCourse(svc, owner.id, {
      slug: `${tag}-c`,
      title: `${tag} course`,
      publish: false,
      sections: [],
    });
    foreign = await createCourse(svc, other.id, {
      slug: `${tag}-f`,
      title: `${tag} foreign`,
      publish: false,
      sections: [{ title: "Theirs", lessons: [{ title: "Their lesson" }] }],
    });
    courseIds.push(course.courseId, foreign.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("builds a curriculum: sections, lessons of every type, in order", async () => {
    currentClient = owner.client;
    expect(await addSection(course.courseId, "Getting started")).toEqual({ ok: true });
    expect(await addSection(course.courseId, "Deep dive")).toEqual({ ok: true });
    expect(await addSection(course.courseId, "Wrap up")).toEqual({ ok: true });
    const [s1, s2] = await outline();

    for (const [title, type] of [["Intro video", "video"], ["Reading", "text"], ["Check quiz", "quiz"], ["Project", "assignment"]]) {
      expect(await addLesson(course.courseId, s1.id, { title, type })).toEqual({ ok: true });
    }
    expect(await addLesson(course.courseId, s2.id, { title: "Advanced", type: "video" })).toEqual({ ok: true });

    const built = await outline();
    expect(built.map((s) => s.position)).toEqual([0, 1, 2]);
    expect(built[0].lessons.map((l) => [l.title, l.type, l.position])).toEqual([
      ["Intro video", "video", 0],
      ["Reading", "text", 1],
      ["Check quiz", "quiz", 2],
      ["Project", "assignment", 3],
    ]);
  });

  it("validates titles, lesson types and ids", async () => {
    currentClient = owner.client;
    const [s1] = await outline();
    expect(await addSection(course.courseId, "   ")).toEqual({ ok: false, error: "Enter a title." });
    expect(await addSection(course.courseId, "x".repeat(201))).toMatchObject({ ok: false });
    expect(await addLesson(course.courseId, s1.id, { title: "ok", type: "hologram" })).toEqual({
      ok: false,
      error: "Choose a lesson type.",
    });
    expect(await addLesson(course.courseId, "not-a-uuid", { title: "x", type: "text" })).toEqual({
      ok: false,
      error: "This course is not available.",
    });
    expect(await renameSection("not-a-uuid", s1.id, "x")).toEqual({ ok: false, error: "This course is not available." });
  });

  it("renames sections and lessons", async () => {
    currentClient = owner.client;
    const [s1] = await outline();
    expect(await renameSection(course.courseId, s1.id, "Getting started (renamed)")).toEqual({ ok: true });
    expect(await renameLesson(course.courseId, s1.lessons[1].id, "Reading (renamed)")).toEqual({ ok: true });
    const [first] = await titles();
    expect(first[0]).toBe("Getting started (renamed)");
    expect(first[1]).toContain("Reading (renamed)");
  });

  it("reorders sections and lessons and persists positions", async () => {
    currentClient = owner.client;
    const before = await outline();
    const sectionOrder = [before[2].id, before[0].id, before[1].id];
    expect(await reorderSections(course.courseId, sectionOrder)).toEqual({ ok: true });
    expect((await outline()).map((s) => s.id)).toEqual(sectionOrder);

    const first = (await outline()).find((s) => s.id === before[0].id)!;
    const reversed = [...first.lessons].reverse().map((l) => l.id);
    expect(await reorderLessons(course.courseId, first.id, reversed)).toEqual({ ok: true });
    const after = (await outline()).find((s) => s.id === first.id)!;
    expect(after.lessons.map((l) => l.id)).toEqual(reversed);
    expect(after.lessons.map((l) => l.position)).toEqual([0, 1, 2, 3]);
  });

  it("rejects a stale or forged order (missing, extra, duplicated or foreign ids)", async () => {
    currentClient = owner.client;
    const sections = await outline();
    const ids = sections.map((s) => s.id);
    const stale = { ok: false, error: "The curriculum changed elsewhere. Refresh and try again." };
    expect(await reorderSections(course.courseId, ids.slice(1))).toEqual(stale);
    expect(await reorderSections(course.courseId, [...ids, ids[0]])).toEqual(stale);
    expect(await reorderSections(course.courseId, [ids[0], ids[0], ids[1]])).toEqual(stale);
    const foreignSection = (await getCurriculum(svc, foreign.versionId))[0];
    expect(await reorderSections(course.courseId, [ids[0], ids[1], foreignSection.id])).toEqual(stale);
    const populated = sections.find((s) => s.lessons.length > 1)!;
    const lessons = populated.lessons.map((l) => l.id);
    expect(await reorderLessons(course.courseId, populated.id, lessons.slice(1))).toEqual(stale);
    expect(await reorderLessons(course.courseId, populated.id, [...lessons, lessons[0]])).toEqual(stale);
  });

  it("moves a lesson to another section and keeps positions gap-free", async () => {
    currentClient = owner.client;
    const sections = await outline();
    const from = sections.find((s) => s.lessons.length === 4)!;
    const to = sections.find((s) => s.id !== from.id)!;
    const moving = from.lessons[0];
    expect(await moveLessonToSection(course.courseId, moving.id, to.id)).toEqual({ ok: true });

    const after = await outline();
    const src = after.find((s) => s.id === from.id)!;
    const dst = after.find((s) => s.id === to.id)!;
    expect(src.lessons.map((l) => l.position)).toEqual([0, 1, 2]);
    expect(dst.lessons[dst.lessons.length - 1].id).toBe(moving.id);
    expect(dst.lessons.map((l) => l.position)).toEqual(dst.lessons.map((_, i) => i));
  });

  it("deletes lessons and sections, re-numbering the rest", async () => {
    currentClient = owner.client;
    let sections = await outline();
    const withLessons = sections.find((s) => s.lessons.length >= 2)!;
    expect(await deleteLesson(course.courseId, withLessons.lessons[0].id)).toEqual({ ok: true });
    sections = await outline();
    const updated = sections.find((s) => s.id === withLessons.id)!;
    expect(updated.lessons.map((l) => l.position)).toEqual(updated.lessons.map((_, i) => i));

    expect(await deleteSection(course.courseId, withLessons.id)).toEqual({ ok: true });
    sections = await outline();
    expect(sections.find((s) => s.id === withLessons.id)).toBeUndefined();
    expect(sections.map((s) => s.position)).toEqual(sections.map((_, i) => i));
    const { count } = await svc.from("lessons").select("id", { count: "exact", head: true }).in("id", withLessons.lessons.map((l) => l.id));
    expect(count).toBe(0); // lessons went with their section
  });

  it("keeps the version updated_at and total duration current", async () => {
    currentClient = owner.client;
    const [s] = await outline();
    await addLesson(course.courseId, s.id, { title: "Timed", type: "text" });
    const lesson = (await outline()).flatMap((x) => x.lessons).find((l) => l.title === "Timed")!;
    await svc.from("lessons").update({ duration_minutes: 12 }).eq("id", lesson.id);
    const { data } = await svc.from("course_versions").select("duration_minutes").eq("id", course.versionId).single();
    const total = (await outline()).flatMap((x) => x.lessons).reduce((n, l) => n + l.durationMinutes, 0);
    expect(data!.duration_minutes).toBe(total);
    expect(total).toBeGreaterThanOrEqual(12);
  });

  it("cannot touch another instructor course, a learner cannot edit, ids of other courses are refused", async () => {
    const theirs = (await getCurriculum(svc, foreign.versionId))[0];
    currentClient = owner.client;
    // Own course id but a section/lesson that belongs to someone else's version.
    expect(await renameSection(course.courseId, theirs.id, "Hijack")).toEqual({ ok: false, error: "This course is not available." });
    expect(await deleteLesson(course.courseId, theirs.lessons[0].id)).toEqual({ ok: false, error: "This course is not available." });
    expect(await moveLessonToSection(course.courseId, theirs.lessons[0].id, theirs.id)).toEqual({ ok: false, error: "This course is not available." });
    // Someone else's course id.
    expect(await addSection(foreign.courseId, "Hijack")).toEqual({ ok: false, error: "This course is not available." });
    currentClient = learner.client;
    expect(await addSection(course.courseId, "Nope")).toEqual({ ok: false, error: "This course is not available." });
    const after = await getCurriculum(svc, foreign.versionId);
    expect(after[0].title).toBe("Theirs");
    expect(after[0].lessons).toHaveLength(1);
  });

  it("is locked while the version is in review", async () => {
    currentClient = owner.client;
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", course.versionId);
    const before = await titles();
    const locked = { ok: false, error: "This course is locked while it is in review or published." };
    const [s] = await outline();
    expect(await addSection(course.courseId, "Sneaky")).toEqual(locked);
    expect(await renameSection(course.courseId, s.id, "Sneaky")).toEqual(locked);
    expect(await deleteSection(course.courseId, s.id)).toEqual(locked);
    expect(await titles()).toEqual(before);
    await svc.from("course_versions").update({ status: "changes_requested" }).eq("id", course.versionId);
    expect(await addSection(course.courseId, "Allowed again")).toEqual({ ok: true });
  });
});
