import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getCourseForReview, notesFor } from "@/features/admin/review";
import { addReviewNote, deleteReviewNote } from "@/features/admin/review-actions";
import { transitionCourse } from "@/features/courses/transition";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-406: the review screen data and section-linked reviewer notes.
describe.skipIf(!hasLiveProject)("course review data and notes (T-073, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cr");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let reviewer: { id: string; client: SupabaseClient };
  let support: { id: string; client: SupabaseClient };
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let c: Awaited<ReturnType<typeof createCourse>>;
  let foreign: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const sectionId = async () =>
    (await svc.from("course_sections").select("id").eq("version_id", c.versionId).limit(1).single()).data!.id as string;

  beforeAll(async () => {
    reviewer = await user("rev", "content_reviewer");
    support = await user("sup", "support_agent");
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    c = await createCourse(svc, owner.id, {
      slug: `${tag}-c`,
      title: `${tag} Course`,
      publish: false,
      description: "Short",
      sections: [{ title: "Intro", lessons: [{ title: "Welcome", content: "<p>Hi</p>" }, { title: "Second", content: "" }] }],
    });
    foreign = await createCourse(svc, other.id, { slug: `${tag}-f`, title: `${tag} Foreign`, publish: false });
    courseIds.push(c.courseId, foreign.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    await svc.from("course_submissions").insert({ version_id: c.versionId, submitted_by: owner.id, notes: "Look at lesson two" });
  }, 120_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 60_000);

  it("loads details, instructor, submission notes and the failing automatic checks", async () => {
    const r = await getCourseForReview(reviewer.client, c.courseId);
    expect(r).toMatchObject({ title: `${tag} Course`, status: "submitted", versionNumber: 1, submission: { notes: "Look at lesson two" } });
    expect(r!.instructor.id).toBe(owner.id);
    expect(r!.instructor.email).toContain("@");
    expect(r!.snapshot.sections[0].lessons.map((l) => l.title)).toEqual(["Welcome", "Second"]);
    const failing = r!.report.missing.map((m) => m.id);
    expect(failing).toEqual(expect.arrayContaining(["description", "thumbnail", "lesson-content"]));
  });

  it("returns null for malformed and unknown ids", async () => {
    expect(await getCourseForReview(reviewer.client, "nope")).toBeNull();
    expect(await getCourseForReview(reviewer.client, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("reviewers add course, section and lesson notes with the target title snapshotted", async () => {
    currentClient = reviewer.client;
    const sec = await sectionId();
    expect(await addReviewNote(c.courseId, { type: "course", id: null }, "Overall: thin description")).toEqual({ ok: true });
    expect(await addReviewNote(c.courseId, { type: "section", id: sec }, "Rename this section")).toEqual({ ok: true });
    expect(await addReviewNote(c.courseId, { type: "lesson", id: c.lessonIds[1] }, "  Empty lesson  ")).toEqual({ ok: true });
    const r = await getCourseForReview(reviewer.client, c.courseId);
    expect(notesFor(r!.notes, "course", null).map((n) => n.body)).toEqual(["Overall: thin description"]);
    expect(notesFor(r!.notes, "section", sec)[0]).toMatchObject({ targetTitle: "Intro", authorId: reviewer.id });
    expect(notesFor(r!.notes, "lesson", c.lessonIds[1])[0]).toMatchObject({ body: "Empty lesson", targetTitle: "Second" });
  });

  it("validates input and targets, and refuses non-reviewers", async () => {
    currentClient = reviewer.client;
    expect(await addReviewNote(c.courseId, { type: "course", id: null }, "   ")).toEqual({ ok: false, error: "Write a note first." });
    expect(await addReviewNote(c.courseId, { type: "course", id: null }, "x".repeat(2001))).toEqual({ ok: false, error: "Keep the note under 2000 characters." });
    expect(await addReviewNote(c.courseId, { type: "lesson", id: foreign.lessonIds[0] }, "wrong course")).toEqual({ ok: false, error: "That lesson does not exist." });
    expect(await addReviewNote(c.courseId, { type: "section", id: "junk" }, "bad id")).toEqual({ ok: false, error: "That section does not exist." });
    for (const who of [support, owner, learner]) {
      currentClient = who.client;
      expect(await addReviewNote(c.courseId, { type: "course", id: null }, "sneaky")).toEqual({ ok: false, error: "You do not have permission to review courses." });
    }
    // Direct API inserts are refused too.
    const { error } = await owner.client.from("course_review_notes").insert({ version_id: c.versionId, target_type: "course", body: "x", author_id: owner.id });
    expect(error).not.toBeNull();
  });

  it("read access: reviewers and read_all roles yes; the owner not until a decision is sent; others never", async () => {
    expect((await support.client.from("course_review_notes").select("id").eq("version_id", c.versionId)).data!.length).toBeGreaterThanOrEqual(3);
    expect((await owner.client.from("course_review_notes").select("id").eq("version_id", c.versionId)).data).toEqual([]);

    await transitionCourse(reviewer.client, c.courseId, "start_review", "");
    // A note written after the decision is still hidden from the owner.
    await transitionCourse(reviewer.client, c.courseId, "request_changes", "See the notes");
    currentClient = reviewer.client;
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", c.versionId);
    expect(await addReviewNote(c.courseId, { type: "course", id: null }, "Late thought")).toEqual({ ok: true });

    const seen = (await owner.client.from("course_review_notes").select("body").eq("version_id", c.versionId)).data!.map((n) => n.body);
    expect(seen).toEqual(expect.arrayContaining(["Overall: thin description", "Rename this section", "Empty lesson"]));
    expect(seen).not.toContain("Late thought");
    expect((await other.client.from("course_review_notes").select("id").eq("version_id", c.versionId)).data).toEqual([]);
    expect((await learner.client.from("course_review_notes").select("id").eq("version_id", c.versionId)).data).toEqual([]);
  });

  it("refuses notes once the course is no longer being reviewed", async () => {
    await svc.from("course_versions").update({ status: "changes_requested" }).eq("id", c.versionId);
    currentClient = reviewer.client;
    expect(await addReviewNote(c.courseId, { type: "course", id: null }, "too late")).toEqual({ ok: false, error: "Notes can only be added while the course is being reviewed." });
  });

  it("a reviewer can delete only their own notes", async () => {
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", c.versionId);
    currentClient = reviewer.client;
    await addReviewNote(c.courseId, { type: "course", id: null }, "Delete me");
    const { data } = await svc.from("course_review_notes").select("id").eq("body", "Delete me").eq("version_id", c.versionId).single();
    const admin2 = await user("adm", "admin");
    currentClient = admin2.client;
    expect(await deleteReviewNote(c.courseId, data!.id as string)).toEqual({ ok: false, error: "Note not found." });
    currentClient = reviewer.client;
    expect(await deleteReviewNote(c.courseId, data!.id as string)).toEqual({ ok: true });
    expect((await svc.from("course_review_notes").select("id").eq("id", data!.id as string)).data).toEqual([]);
  });
});
