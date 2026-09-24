import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { submitCourseForReview } from "@/features/course-authoring/submit-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-210: submitting is gated by readiness, locks the version, and records a submission.
describe.skipIf(!hasLiveProject)("submit for review (T-058, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("sb");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let categoryId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  /** A course that satisfies every readiness rule. */
  async function readyCourse(slug: string) {
    const c = await createCourse(svc, owner.id, {
      slug: `${tag}-${slug}`,
      title: `${tag} ${slug}`,
      publish: false,
      categoryId,
      description: "A complete description that is comfortably longer than the fifty character minimum.",
      outcomes: ["Learn things"],
    });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ thumbnail_url: "https://example.com/t.png" }).eq("id", c.versionId);
    await createAssessment(svc, c.versionId, {
      title: "Quiz",
      questions: [{ type: "true_false", prompt: "True?", options: ["True", "False"], correct: [0] }],
    });
    return c;
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    const { data: cat } = await svc.from("categories").select("id").limit(1).single();
    categoryId = cat!.id as string;
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("submits a ready course: status becomes submitted and a submission with notes is stored", async () => {
    const c = await readyCourse("ok");
    currentClient = owner.client;
    expect(await submitCourseForReview(c.courseId, "  Please check lesson 2  ")).toEqual({ ok: true });
    const { data: v } = await svc.from("course_versions").select("status").eq("id", c.versionId).single();
    expect(v!.status).toBe("submitted");
    const { data: subs } = await svc.from("course_submissions").select("notes, submitted_by").eq("version_id", c.versionId);
    expect(subs).toEqual([{ notes: "Please check lesson 2", submitted_by: owner.id }]);
    const { data: audit } = await svc.from("audit_logs").select("actor_id, action, metadata").eq("resource_id", c.courseId);
    expect(audit).toEqual([{ actor_id: owner.id, action: "course.submitted", metadata: expect.objectContaining({ versionId: c.versionId, hasNotes: true }) }]);
    // The owner can read their own submission history; another instructor cannot.
    const mine = await owner.client.from("course_submissions").select("id").eq("version_id", c.versionId);
    expect(mine.data).toHaveLength(1);
    const theirs = await other.client.from("course_submissions").select("id").eq("version_id", c.versionId);
    expect(theirs.data).toEqual([]);
  });

  it("locks the version: no second submit and no edits", async () => {
    const c = courseIds.length ? { courseId: courseIds[0] } : null;
    currentClient = owner.client;
    expect(await submitCourseForReview(c!.courseId, "")).toEqual({ ok: false, error: "This course has already been submitted." });
    const { data } = await owner.client.from("course_versions").update({ title: "hack" }).eq("course_id", c!.courseId).select("id");
    expect(data).toEqual([]);
  });

  it("blocks an unready course and lists what is missing, changing nothing", async () => {
    const c = await createCourse(svc, owner.id, { slug: `${tag}-bad`, title: `${tag} bad`, publish: false });
    courseIds.push(c.courseId);
    currentClient = owner.client;
    const r = await submitCourseForReview(c.courseId, "");
    expect(r).toMatchObject({ ok: false, error: "Finish the readiness checklist before submitting." });
    expect((r as { missing: string[] }).missing).toEqual(expect.arrayContaining(["Thumbnail image", "Category"]));
    const { data: v } = await svc.from("course_versions").select("status").eq("id", c.versionId).single();
    expect(v!.status).toBe("draft");
    const { count } = await svc.from("course_submissions").select("id", { count: "exact", head: true }).eq("version_id", c.versionId);
    expect(count).toBe(0);
  });

  it("refuses over-long notes", async () => {
    const c = await readyCourse("long");
    currentClient = owner.client;
    expect(await submitCourseForReview(c.courseId, "x".repeat(2001))).toEqual({ ok: false, error: "Keep your notes under 2000 characters." });
  });

  it("refuses other instructors and learners", async () => {
    const c = await readyCourse("own2");
    for (const who of [other, learner]) {
      currentClient = who.client;
      expect(await submitCourseForReview(c.courseId, "")).toEqual({ ok: false, error: "This course is not available." });
    }
    const { data: v } = await svc.from("course_versions").select("status").eq("id", c.versionId).single();
    expect(v!.status).toBe("draft");
  });

  it("resubmits after changes were requested", async () => {
    const c = await readyCourse("again");
    await svc.from("course_versions").update({ status: "changes_requested" }).eq("id", c.versionId);
    currentClient = owner.client;
    expect(await submitCourseForReview(c.courseId, "Fixed it")).toEqual({ ok: true });
    const { data: v } = await svc.from("course_versions").select("status").eq("id", c.versionId).single();
    expect(v!.status).toBe("submitted");
  });

  it("cannot be called through the API by an instructor (service role only)", async () => {
    const c = await readyCourse("rpc");
    const { error } = await owner.client.rpc("submit_course_version", { p_version_id: c.versionId, p_user_id: owner.id, p_notes: "" });
    expect(error).not.toBeNull();
    const { data: v } = await svc.from("course_versions").select("status").eq("id", c.versionId).single();
    expect(v!.status).toBe("draft");
  });
});
