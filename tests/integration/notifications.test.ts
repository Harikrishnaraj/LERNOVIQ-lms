import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { deleteNotification, markAllRead, markRead, setPreference } from "@/features/notifications/actions";
import { PAGE_SIZE, getPreferences, getUnreadCount, listNotifications } from "@/features/notifications/notifications";
import { notify } from "@/services/notifications";
import { transitionCourse } from "@/features/courses/transition";
import { postReply, startDiscussion } from "@/features/discussions/actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-115: persistent notifications, read state, preferences respected, wired to real events.
describe.skipIf(!hasLiveProject)("notifications (T-085, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("nt");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  type U = { id: string; client: SupabaseClient };
  let me: U, other: U, teacher: U, reviewer: U, helper: U;

  async function user(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const titles = async (u: U) => ((await svc.from("notifications").select("title").eq("user_id", u.id).order("created_at")).data ?? []).map((n) => n.title as string);

  beforeAll(async () => {
    me = await user("me", "learner");
    other = await user("oth", "learner");
    helper = await user("hlp", "learner");
    teacher = await user("tch", "instructor");
    reviewer = await user("rev", "content_reviewer");
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("notify creates a row, sanitises links, and refuses bad categories", async () => {
    expect(await notify({ userId: me.id, category: "system", title: "Welcome", body: "Hello", href: "/learner" })).toBe(true);
    expect(await notify({ userId: me.id, category: "system", title: "Evil link", href: "https://evil.example.com" })).toBe(true);
    expect(await notify({ userId: me.id, category: "system", title: "Sneaky link", href: "//evil.example.com" })).toBe(true);
    expect(await notify({ userId: me.id, category: "bogus" as never, title: "Nope" })).toBe(false);
    const { data } = await svc.from("notifications").select("title, href, read_at").eq("user_id", me.id).order("created_at");
    expect(data).toEqual([
      { title: "Welcome", href: "/learner", read_at: null },
      { title: "Evil link", href: null, read_at: null },
      { title: "Sneaky link", href: null, read_at: null },
    ]);
  });

  it("unread count, listing, filters and paging work per user", async () => {
    expect(await getUnreadCount(me.client)).toBe(3);
    expect(await getUnreadCount(other.client)).toBe(0);
    const all = await listNotifications(me.client, { unreadOnly: false, page: 1 });
    expect(all.total).toBe(3);
    expect(all.items.map((n) => n.title)).toEqual(["Sneaky link", "Evil link", "Welcome"]);
    expect(all.items.every((n) => n.href === null || n.href.startsWith("/"))).toBe(true);
    // A page past the end returns no rows and the true total instead of an error.
    expect(await listNotifications(me.client, { unreadOnly: false, page: 99 })).toEqual({ items: [], total: 3 });
    expect(PAGE_SIZE).toBe(20);
  });

  it("marks read and unread, and marks everything read; only your own", async () => {
    currentClient = me.client;
    const first = (await listNotifications(me.client, { unreadOnly: true, page: 1 })).items[0];
    expect(await markRead(first.id)).toEqual({ ok: true });
    expect(await getUnreadCount(me.client)).toBe(2);
    expect(await markRead(first.id, false)).toEqual({ ok: true });
    expect(await getUnreadCount(me.client)).toBe(3);
    expect(await markRead("not-a-uuid")).toMatchObject({ ok: false });

    // Another user cannot change mine (the update matches zero rows).
    currentClient = other.client;
    await markRead(first.id);
    expect(await getUnreadCount(me.client)).toBe(3);
    expect(await markAllRead()).toEqual({ ok: true });
    expect(await getUnreadCount(me.client)).toBe(3);

    currentClient = me.client;
    expect(await markAllRead()).toEqual({ ok: true });
    expect(await getUnreadCount(me.client)).toBe(0);
    expect((await listNotifications(me.client, { unreadOnly: true, page: 1 })).items).toEqual([]);
  });

  it("RLS: no direct inserts, only read_at is updatable, others cannot see or delete mine", async () => {
    const ins = await me.client.from("notifications").insert({ user_id: me.id, category: "system", title: "Forged" });
    expect(ins.error).not.toBeNull();
    const row = (await svc.from("notifications").select("id").eq("user_id", me.id).limit(1).single()).data!;
    const edit = await me.client.from("notifications").update({ title: "Changed" }).eq("id", row.id);
    expect(edit.error).not.toBeNull();
    expect((await other.client.from("notifications").select("id").eq("id", row.id)).data).toEqual([]);
    const del = await other.client.from("notifications").delete().eq("id", row.id).select("id");
    expect(del.data ?? []).toEqual([]);
    expect((await svc.from("notifications").select("id").eq("id", row.id)).data).toHaveLength(1);
    expect((await anon().from("notifications").select("id")).data ?? []).toEqual([]);

    currentClient = me.client;
    expect(await deleteNotification(row.id)).toEqual({ ok: true });
    expect((await svc.from("notifications").select("id").eq("id", row.id)).data).toEqual([]);
  });

  it("preferences default on, can be switched off per category, and are respected by notify", async () => {
    currentClient = me.client;
    expect(await getPreferences(me.client, me.id)).toEqual({ course: true, assignment: true, discussion: true, review: true, system: true });
    expect(await setPreference("discussion", false)).toEqual({ ok: true });
    expect(await setPreference("bogus", false)).toMatchObject({ ok: false });
    expect((await getPreferences(me.client, me.id)).discussion).toBe(false);

    const before = await getUnreadCount(me.client);
    expect(await notify({ userId: me.id, category: "discussion", title: "Muted" })).toBe(false);
    expect(await notify({ userId: me.id, category: "system", title: "Still on" })).toBe(true);
    expect(await getUnreadCount(me.client)).toBe(before + 1);
    expect(await setPreference("discussion", true)).toEqual({ ok: true });
    expect(await notify({ userId: me.id, category: "discussion", title: "Unmuted" })).toBe(true);
    // Preferences are private.
    expect((await other.client.from("notification_preferences").select("user_id").eq("user_id", me.id)).data).toEqual([]);
  });

  it("a reviewer decision notifies the course owner; starting review does not", async () => {
    const c = await createCourse(svc, teacher.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    await transitionCourse(reviewer.client, c.courseId, "start_review", "");
    expect(await titles(teacher)).toEqual([]);
    await transitionCourse(reviewer.client, c.courseId, "request_changes", "Please add examples");
    const { data } = await svc.from("notifications").select("category, title, body, href").eq("user_id", teacher.id);
    expect(data).toEqual([
      { category: "review", title: "A reviewer asked for changes on your course", body: "Please add examples", href: `/instructor/courses/${c.courseId}` },
    ]);
  });

  it("a reply notifies the thread author, but never yourself", async () => {
    const c = await createCourse(svc, teacher.id, { slug: `${tag}-d`, title: `${tag} Discuss`, publish: true });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert([
      { user_id: me.id, course_id: c.courseId, version_id: c.versionId },
      { user_id: helper.id, course_id: c.courseId, version_id: c.versionId },
    ]);
    currentClient = me.client;
    const t = await startDiscussion(c.courseId, { title: "Help wanted", body: "Question" });
    const threadId = (t as { id: string }).id;
    const before = (await titles(me)).length;
    await postReply(threadId, "Replying to myself");
    expect((await titles(me)).length).toBe(before);
    currentClient = helper.client;
    await postReply(threadId, "Here is help");
    const mine = await titles(me);
    expect(mine.at(-1)).toBe("New reply: Help wanted");
    expect(mine.length).toBe(before + 1);
  });
});
