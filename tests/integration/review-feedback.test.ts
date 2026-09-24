import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { feedbackHref, getReviewFeedback } from "@/features/course-authoring/feedback";
import { reopenRejectedCourse } from "@/features/course-authoring/feedback-actions";
import { transitionCourse } from "@/features/courses/transition";
import { addReviewNote } from "@/features/admin/review-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-211: the instructor sees status, sent-back feedback linked to sections, can reopen a rejection,
// and every version keeps its decision trail.
describe.skipIf(!hasLiveProject)("review feedback for instructors (T-075, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("rf");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let reviewer: { id: string; client: SupabaseClient };
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  async function inReview(slug: string) {
    const c = await createCourse(svc, owner.id, {
      slug: `${tag}-${slug}`,
      title: `${tag} ${slug}`,
      publish: false,
      sections: [{ title: "Intro", lessons: [{ title: "Welcome" }] }],
    });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", c.versionId);
    return c;
  }

  beforeAll(async () => {
    reviewer = await user("rev", "content_reviewer");
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }), 120_000);

  it("shows nothing until a decision is sent, then the decision and the notes", async () => {
    const c = await inReview("sent");
    currentClient = reviewer.client;
    const sec = (await svc.from("course_sections").select("id").eq("version_id", c.versionId).single()).data!.id as string;
    await addReviewNote(c.courseId, { type: "section", id: sec }, "Reorder this section");
    await addReviewNote(c.courseId, { type: "lesson", id: c.lessonIds[0] }, "Lesson is thin");

    let f = await getReviewFeedback(owner.client, c.courseId, c.versionId);
    expect(f.latestDecision).toBeNull();
    expect(f.notes).toEqual([]);

    expect(await transitionCourse(reviewer.client, c.courseId, "request_changes", "Please address the notes")).toEqual({ ok: true, to: "changes_requested" });
    f = await getReviewFeedback(owner.client, c.courseId, c.versionId);
    expect(f.latestDecision).toMatchObject({ action: "request_changes", note: "Please address the notes" });
    expect(f.notes.map((n) => [n.targetType, n.targetTitle, n.body])).toEqual([
      ["section", "Intro", "Reorder this section"],
      ["lesson", "Welcome", "Lesson is thin"],
    ]);
    expect(feedbackHref(c.courseId, f.notes[0])).toBe(`/instructor/courses/${c.courseId}/curriculum`);
    expect(feedbackHref(c.courseId, f.notes[1])).toBe(`/instructor/courses/${c.courseId}/lessons/${c.lessonIds[0]}`);
    expect(feedbackHref(c.courseId, { targetType: "course", targetId: null })).toBe(`/instructor/courses/${c.courseId}/basics`);
  });

  it("other instructors see none of it", async () => {
    const c = courseIds[0];
    const f = await getReviewFeedback(other.client, c, "00000000-0000-4000-8000-000000000000");
    expect(f).toEqual({ latestDecision: null, notes: [], versions: [] });
  });

  it("keeps every version with its decisions, newest first", async () => {
    const c = await inReview("versions");
    await transitionCourse(reviewer.client, c.courseId, "approve", "Fine");
    await svc.from("course_versions").insert({ course_id: c.courseId, version_number: 2, title: `${tag} v2`, status: "draft" });
    const f = await getReviewFeedback(owner.client, c.courseId, c.versionId);
    expect(f.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(f.versions[1].decisions.map((d) => d.action)).toEqual(["approve"]);
    expect(f.versions[0].decisions).toEqual([]);
  });

  it("the owner can reopen a rejected course as a draft, once; nobody else can", async () => {
    const c = await inReview("reopen");
    await transitionCourse(reviewer.client, c.courseId, "reject", "Not a fit");
    currentClient = other.client;
    expect(await reopenRejectedCourse(c.courseId)).toEqual({ ok: false, error: "This course is not available." });
    currentClient = owner.client;
    expect(await reopenRejectedCourse(c.courseId)).toEqual({ ok: true });
    expect((await svc.from("course_versions").select("status").eq("id", c.versionId).single()).data!.status).toBe("draft");
    expect(await reopenRejectedCourse(c.courseId)).toEqual({ ok: false, error: "Only a rejected course can be reopened." });
    const { data } = await svc.from("audit_logs").select("action").eq("resource_id", c.courseId).order("created_at");
    expect(data!.map((a) => a.action)).toEqual(["course.rejected", "course.reopened"]);
  });

  it("refuses to reopen a course that is not rejected", async () => {
    const c = await inReview("notrej");
    currentClient = owner.client;
    expect(await reopenRejectedCourse(c.courseId)).toEqual({ ok: false, error: "Only a rejected course can be reopened." });
  });
});
