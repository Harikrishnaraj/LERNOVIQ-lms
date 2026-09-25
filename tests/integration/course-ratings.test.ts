import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteReview, saveReview } from "@/features/reviews/actions";
import { getCourseReviews } from "@/features/reviews/reviews";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-117: only learners who completed the course review it, once; aggregates and visibility follow.
describe.skipIf(!hasLiveProject)("course ratings (T-087, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cr");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let done1: U, done2: U, learning: U, outsider: U, teacher: U;
  let c: Awaited<ReturnType<typeof createCourse>>;
  let draft: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role = "learner", fullName?: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    if (fullName) await svc.from("profiles").update({ full_name: fullName }).eq("id", u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const as = (u: U) => {
    currentClient = u.client;
  };
  const course = async () => (await svc.from("courses").select("rating_avg, rating_count").eq("id", c.courseId).single()).data!;

  beforeAll(async () => {
    done1 = await user("d1", "learner", "Dana Done");
    done2 = await user("d2");
    learning = await user("lrn");
    outsider = await user("out");
    teacher = await user("tch", "instructor");
    c = await createCourse(svc, teacher.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    draft = await createCourse(svc, teacher.id, { slug: `${tag}-dr`, title: `${tag} Draft`, publish: false });
    courseIds.push(c.courseId, draft.courseId);
    await svc.from("enrollments").insert([
      { user_id: done1.id, course_id: c.courseId, version_id: c.versionId, status: "completed", completed_at: new Date().toISOString() },
      { user_id: done2.id, course_id: c.courseId, version_id: c.versionId, status: "completed", completed_at: new Date().toISOString() },
      { user_id: learning.id, course_id: c.courseId, version_id: c.versionId, status: "active" },
    ]);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("only a learner who completed the course can review it; others are refused", async () => {
    for (const u of [learning, outsider]) {
      as(u);
      expect(await saveReview(c.courseId, { rating: 5, body: "sneaky" })).toEqual({ ok: false, error: "You can review a course after you have completed it." });
    }
    expect((await svc.from("course_ratings").select("id").eq("course_id", c.courseId)).data).toEqual([]);
    const direct = await learning.client.from("course_ratings").insert({ course_id: c.courseId, user_id: learning.id, rating: 5 });
    expect(direct.error).not.toBeNull();
    const forOther = await done1.client.from("course_ratings").insert({ course_id: c.courseId, user_id: done2.id, rating: 1 });
    expect(forOther.error).not.toBeNull();
  });

  it("validates input", async () => {
    as(done1);
    expect(await saveReview(c.courseId, { rating: 0, body: "" })).toMatchObject({ ok: false, fieldErrors: { rating: expect.any(String) } });
    expect(await saveReview(c.courseId, { rating: 3, body: "x".repeat(2001) })).toMatchObject({ ok: false, fieldErrors: { body: expect.any(String) } });
    expect(await saveReview("nope", { rating: 3, body: "" })).toEqual({ ok: false, error: "This course is not available." });
  });

  it("posts a review, keeps one per learner (editing replaces it) and updates the course aggregates", async () => {
    as(done1);
    expect(await saveReview(c.courseId, { rating: 4, body: "  Very good  " })).toEqual({ ok: true });
    expect(await course()).toEqual({ rating_avg: 4, rating_count: 1 });
    expect(await saveReview(c.courseId, { rating: 5, body: "Excellent" })).toEqual({ ok: true });
    expect((await svc.from("course_ratings").select("rating, body").eq("user_id", done1.id)).data).toEqual([{ rating: 5, body: "Excellent" }]);
    as(done2);
    expect(await saveReview(c.courseId, { rating: 2, body: "" })).toEqual({ ok: true });
    expect(await course()).toEqual({ rating_avg: 3.5, rating_count: 2 });
  });

  it("the review is public with the author display name, distribution and the reader's own state", async () => {
    const asAnon = (await getCourseReviews(anon(), `${tag}-c`))!;
    expect(asAnon).toMatchObject({ average: 3.5, count: 2, canReview: false, mine: null });
    expect(asAnon.distribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 0, 5: 1 });
    expect(asAnon.reviews.map((r) => [r.rating, r.authorName, r.mine])).toEqual([
      [2, "A learner", false],
      [5, "Dana Done", false],
    ]);
    expect(JSON.stringify(asAnon)).not.toContain("@example.com");

    const mine = (await getCourseReviews(done1.client, `${tag}-c`))!;
    expect(mine).toMatchObject({ canReview: true, mine: { rating: 5, body: "Excellent" } });
    expect(mine.reviews[0]).toMatchObject({ mine: true, rating: 5 });
    expect((await getCourseReviews(learning.client, `${tag}-c`))!.canReview).toBe(false);
    expect(await getCourseReviews(anon(), `${tag}-dr`)).toBeNull();
    expect(await getCourseReviews(anon(), "no-such-course")).toBeNull();
  });

  it("only rating and text are editable, and only by the author", async () => {
    const own = (await svc.from("course_ratings").select("id").eq("user_id", done1.id).single()).data!;
    const reply = await done1.client.from("course_ratings").update({ instructor_reply: "I reply to myself" }).eq("id", own.id);
    expect(reply.error).not.toBeNull();
    const unhide = await done1.client.from("course_ratings").update({ hidden: false, user_id: done2.id }).eq("id", own.id);
    expect(unhide.error).not.toBeNull();
    const theirs = await done2.client.from("course_ratings").update({ rating: 1 }).eq("id", own.id).select("id");
    expect(theirs.error !== null || (theirs.data ?? []).length === 0).toBe(true);
    expect((await svc.from("course_ratings").select("rating").eq("id", own.id).single()).data!.rating).toBe(5);
  });

  it("hidden reviews disappear from the public list and the aggregates", async () => {
    const own = (await svc.from("course_ratings").select("id").eq("user_id", done2.id).single()).data!;
    await svc.from("course_ratings").update({ hidden: true }).eq("id", own.id);
    expect(await course()).toEqual({ rating_avg: 5, rating_count: 1 });
    const pub = (await getCourseReviews(anon(), `${tag}-c`))!;
    expect(pub.reviews.map((r) => r.authorName)).toEqual(["Dana Done"]);
    // The author still sees their own row.
    expect((await done2.client.from("course_ratings").select("id").eq("id", own.id)).data).toHaveLength(1);
    await svc.from("course_ratings").update({ hidden: false }).eq("id", own.id);
    expect(await course()).toEqual({ rating_avg: 3.5, rating_count: 2 });
  });

  it("the instructor is notified of a new review once, and deleting removes it from the aggregates", async () => {
    const notes = (await svc.from("notifications").select("title").eq("user_id", teacher.id)).data!.map((n) => n.title);
    expect(notes.sort()).toEqual(["New 2-star review on your course", "New 4-star review on your course"]);
    as(done2);
    expect(await deleteReview(c.courseId)).toEqual({ ok: true });
    expect(await course()).toEqual({ rating_avg: 5, rating_count: 1 });
    expect(await deleteReview(c.courseId)).toEqual({ ok: false, error: "You have no review to delete." });
    as(learning);
    expect(await deleteReview(c.courseId)).toEqual({ ok: false, error: "You have no review to delete." });
  });
});
