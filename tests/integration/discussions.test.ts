import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteOwn, markAnswered, postReply, reportContent, startDiscussion, toggleVote } from "@/features/discussions/actions";
import { getDiscussion, listDiscussions } from "@/features/discussions/discussions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-113: course threads, replies, upvotes, answered state and reports, with strict access rules.
describe.skipIf(!hasLiveProject)("discussions (T-083, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("dc");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let asker: U, helper: U, outsider: U, teacher: U, otherTeacher: U, staff: U;
  let course: Awaited<ReturnType<typeof createCourse>>;
  let otherCourse: Awaited<ReturnType<typeof createCourse>>;
  let threadId: string;

  async function user(name: string, role: string, fullName?: string): Promise<U> {
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

  beforeAll(async () => {
    asker = await user("ask", "learner", "Ada Asker");
    helper = await user("hlp", "learner", "Hal Helper");
    outsider = await user("out", "learner");
    teacher = await user("tch", "instructor", "Tess Teacher");
    otherTeacher = await user("otc", "instructor");
    staff = await user("stf", "support_agent");
    course = await createCourse(svc, teacher.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    otherCourse = await createCourse(svc, otherTeacher.id, { slug: `${tag}-o`, title: `${tag} Other`, publish: true });
    courseIds.push(course.courseId, otherCourse.courseId);
    await svc.from("enrollments").insert([
      { user_id: asker.id, course_id: course.courseId, version_id: course.versionId },
      { user_id: helper.id, course_id: course.courseId, version_id: course.versionId },
    ]);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("an enrolled learner starts a thread; validation and enrollment are enforced", async () => {
    as(asker);
    expect(await startDiscussion(course.courseId, { title: "ab", body: "" })).toMatchObject({ ok: false, fieldErrors: { title: expect.any(String), body: expect.any(String) } });
    expect(await startDiscussion("nope", { title: "Valid title", body: "Body" })).toEqual({ ok: false, error: "Choose a course." });
    const r = await startDiscussion(course.courseId, { title: "  How do I  begin? ", body: "Where do I start?" });
    expect(r.ok).toBe(true);
    threadId = (r as { id: string }).id;
    const row = (await svc.from("discussions").select("title, author_id, pinned, hidden").eq("id", threadId).single()).data;
    expect(row).toEqual({ title: "How do I begin?", author_id: asker.id, pinned: false, hidden: false });

    as(outsider);
    expect(await startDiscussion(course.courseId, { title: "Sneaky post", body: "Hi" })).toEqual({ ok: false, error: "You can only start a discussion in a course you are enrolled in." });
    as(asker);
    expect(await startDiscussion(otherCourse.courseId, { title: "Wrong course", body: "Hi" })).toMatchObject({ ok: false });
  });

  it("enrolled learners, the owner and staff can read; outsiders and other instructors cannot", async () => {
    for (const u of [asker, helper, teacher, staff]) {
      const t = await getDiscussion(u.client, threadId);
      expect(t).toMatchObject({ title: "How do I begin?", authorName: "Ada Asker", courseTitle: `${tag} Course`, posts: [] });
      expect((await listDiscussions(u.client)).some((x) => x.id === threadId)).toBe(true);
    }
    expect((await getDiscussion(asker.client, threadId))!.mine).toBe(true);
    expect((await getDiscussion(helper.client, threadId))!.mine).toBe(false);
    for (const u of [outsider, otherTeacher]) {
      expect(await getDiscussion(u.client, threadId)).toBeNull();
      expect((await listDiscussions(u.client)).some((x) => x.id === threadId)).toBe(false);
      expect((await u.client.from("discussions").select("id").eq("id", threadId)).data).toEqual([]);
    }
    expect(await getDiscussion(asker.client, "not-a-uuid")).toBeNull();
    await expect(getDiscussion(anon(), threadId)).rejects.toThrow();
  });

  it("replies: enrolled learners and the instructor may reply, outsiders may not; names never leak emails", async () => {
    as(helper);
    expect(await postReply(threadId, "  Start with lesson one  ")).toEqual({ ok: true });
    as(teacher);
    expect(await postReply(threadId, "Welcome! Use the sidebar.")).toEqual({ ok: true });
    as(outsider);
    expect(await postReply(threadId, "let me in")).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    as(helper);
    expect(await postReply(threadId, "   ")).toEqual({ ok: false, error: "Write a reply first." });

    const t = (await getDiscussion(asker.client, threadId))!;
    expect(t.posts.map((p) => [p.body, p.authorName, p.isInstructor])).toEqual([
      ["Start with lesson one", "Hal Helper", false],
      ["Welcome! Use the sidebar.", "Tess Teacher", true],
    ]);
    expect(JSON.stringify(t)).not.toContain("@example.com");
    expect((await listDiscussions(asker.client)).find((x) => x.id === threadId)!.replies).toBe(2);
  });

  it("upvotes toggle, count correctly, and cannot be applied to your own post or without access", async () => {
    let t = (await getDiscussion(helper.client, threadId))!;
    const helperPost = t.posts[0].id;
    const teacherPost = t.posts[1].id;
    as(asker);
    expect(await toggleVote("post", helperPost, threadId)).toEqual({ ok: true, voted: true, votes: 1 });
    as(teacher);
    expect(await toggleVote("post", helperPost, threadId)).toEqual({ ok: true, voted: true, votes: 2 });
    as(asker);
    expect(await toggleVote("post", helperPost, threadId)).toEqual({ ok: true, voted: false, votes: 1 });
    expect(await toggleVote("thread", threadId, threadId)).toEqual({ ok: false, error: "You cannot upvote your own post." });
    as(helper);
    expect(await toggleVote("thread", threadId, threadId)).toEqual({ ok: true, voted: true, votes: 1 });
    as(outsider);
    expect(await toggleVote("post", teacherPost, threadId)).toEqual({ ok: false, error: "You cannot do that in this discussion." });

    t = (await getDiscussion(teacher.client, threadId))!;
    expect(t.posts[0]).toMatchObject({ votes: 1, voted: true });
    expect(t.votes).toBe(1);
    expect(t.voted).toBe(false);
    // Direct writes to votes are refused.
    const direct = await outsider.client.from("discussion_votes").insert({ user_id: outsider.id, target_type: "post", target_id: helperPost });
    expect(direct.error).not.toBeNull();
  });

  it("marks an answer: thread author or instructor only, and only a reply of this thread", async () => {
    const t = (await getDiscussion(asker.client, threadId))!;
    const helperPost = t.posts[0].id;
    as(helper);
    expect(await markAnswered(threadId, helperPost)).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    as(outsider);
    expect(await markAnswered(threadId, helperPost)).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    as(asker);
    expect(await markAnswered(threadId, helperPost)).toEqual({ ok: true });
    expect((await getDiscussion(helper.client, threadId))!.answeredPostId).toBe(helperPost);
    expect((await listDiscussions(helper.client)).find((x) => x.id === threadId)!.answered).toBe(true);

    // A reply from another thread is refused.
    as(asker);
    const other = await startDiscussion(course.courseId, { title: "Second thread", body: "More" });
    const otherId = (other as { id: string }).id;
    as(helper);
    await postReply(otherId, "reply on second");
    const foreignPost = (await getDiscussion(helper.client, otherId))!.posts[0].id;
    as(asker);
    expect(await markAnswered(threadId, foreignPost)).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    expect((await getDiscussion(asker.client, threadId))!.answeredPostId).toBe(helperPost);

    // The instructor may change it, and it can be cleared.
    const teacherPost = t.posts[1].id;
    as(teacher);
    expect(await markAnswered(threadId, teacherPost)).toEqual({ ok: true });
    expect(await markAnswered(threadId, null)).toEqual({ ok: true });
    expect((await getDiscussion(asker.client, threadId))!.answeredPostId).toBeNull();

    // The API cannot set the answer or pin directly.
    const upd = await asker.client.from("discussions").update({ answered_post_id: helperPost, pinned: true }).eq("id", threadId).select("id");
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const pinnedInsert = await asker.client.from("discussions").insert({ course_id: course.courseId, author_id: asker.id, title: "Pinned!", body: "x", pinned: true });
    expect(pinnedInsert.error).not.toBeNull();
    const asOther = await asker.client.from("discussions").insert({ course_id: course.courseId, author_id: helper.id, title: "Impersonation", body: "x" });
    expect(asOther.error).not.toBeNull();
  });

  it("reports: once per reporter, validated, and only for content the reporter can see", async () => {
    const t = (await getDiscussion(helper.client, threadId))!;
    const teacherPost = t.posts[1].id;
    as(helper);
    expect(await reportContent("post", teacherPost, "no", threadId)).toEqual({ ok: false, error: "Tell us briefly what is wrong." });
    expect(await reportContent("post", teacherPost, "This is spam", threadId)).toEqual({ ok: true });
    expect(await reportContent("post", teacherPost, "Second time", threadId)).toEqual({ ok: true });
    const rows = (await svc.from("discussion_reports").select("reporter_id, reason, status").eq("target_id", teacherPost)).data;
    expect(rows).toEqual([{ reporter_id: helper.id, reason: "This is spam", status: "open" }]);
    expect((await getDiscussion(helper.client, threadId))!.posts[1].reported).toBe(true);
    expect((await getDiscussion(asker.client, threadId))!.posts[1].reported).toBe(false);
    as(asker);
    expect(await reportContent("thread", threadId, "My own thread", threadId)).toEqual({ ok: false, error: "You cannot report your own post." });
    as(outsider);
    expect(await reportContent("thread", threadId, "Nosy report", threadId)).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    expect((await outsider.client.from("discussion_reports").select("id")).data).toEqual([]);
  });

  it("hidden content is invisible to learners but visible to the instructor", async () => {
    as(asker);
    const r = await startDiscussion(course.courseId, { title: "To be hidden", body: "spam-ish" });
    const id = (r as { id: string }).id;
    await svc.from("discussions").update({ hidden: true }).eq("id", id);
    expect(await getDiscussion(helper.client, id)).toBeNull();
    expect((await listDiscussions(helper.client)).some((x) => x.id === id)).toBe(false);
    expect(await getDiscussion(teacher.client, id)).toMatchObject({ canModerate: true });
    as(helper);
    expect(await postReply(id, "reply to hidden")).toEqual({ ok: false, error: "You cannot do that in this discussion." });
  });

  it("only authors delete their own posts and threads", async () => {
    const t = (await getDiscussion(helper.client, threadId))!;
    const helperPost = t.posts[0].id;
    as(asker);
    expect(await deleteOwn("post", helperPost, threadId)).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    as(helper);
    expect(await deleteOwn("post", helperPost, threadId)).toEqual({ ok: true });
    expect((await getDiscussion(helper.client, threadId))!.posts.map((p) => p.authorName)).toEqual(["Tess Teacher"]);
    as(helper);
    expect(await deleteOwn("thread", threadId, threadId)).toEqual({ ok: false, error: "You cannot do that in this discussion." });
    as(asker);
    expect(await deleteOwn("thread", threadId, threadId)).toEqual({ ok: true });
    expect(await getDiscussion(asker.client, threadId)).toBeNull();
  });
});
