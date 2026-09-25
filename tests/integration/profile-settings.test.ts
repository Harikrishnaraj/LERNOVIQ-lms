import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { changePassword, updateProfile } from "@/features/profile/actions";
import { AVATAR_BUCKET, supabaseStorage } from "@/services/storage";
import { avatarPathFromUrl } from "@/features/profile/rules";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

function form(fields: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

// F-116: name, avatar and password, with only the allowed columns writable.
describe.skipIf(!hasLiveProject)("profile and settings (T-086, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("pf");
  const learnerIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let me: { id: string; email: string; password: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };

  async function user(name: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner");
    learnerIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { ...u, client };
  }

  beforeAll(async () => {
    me = await user("me");
    other = await user("oth");
  }, 200_000);

  afterAll(async () => {
    const { data } = await svc.storage.from(AVATAR_BUCKET).list(me.id);
    if (data?.length) await svc.storage.from(AVATAR_BUCKET).remove(data.map((o) => `${me.id}/${o.name}`));
    await cleanup(svc, { learnerIds, courseIds: [], userIds: [] });
  }, 120_000);

  it("saves a cleaned display name and validates it", async () => {
    currentClient = me.client;
    expect(await updateProfile(form({ fullName: "  Ada   Lovelace " }))).toEqual({ ok: true, avatarUrl: null });
    expect((await svc.from("profiles").select("full_name").eq("id", me.id).single()).data!.full_name).toBe("Ada Lovelace");
    expect(await updateProfile(form({ fullName: "   " }))).toEqual({ ok: false, error: "Enter your name." });
    expect(await updateProfile(form({ fullName: "x".repeat(101) }))).toMatchObject({ ok: false });
  });

  it("uploads an avatar validated by content, replaces it (removing the old file), and removes it", async () => {
    currentClient = me.client;
    const fake = new File([Buffer.from("<script>alert(1)</script>")], "evil.png", { type: "image/png" });
    expect(await updateProfile(form({ fullName: "Ada", avatar: fake }))).toEqual({ ok: false, error: "The picture must be a PNG, JPEG or WebP image." });
    const big = new File([Buffer.concat([PNG, Buffer.alloc(1024 * 1024)])], "big.png", { type: "image/png" });
    expect(await updateProfile(form({ fullName: "Ada", avatar: big }))).toEqual({ ok: false, error: "The picture must be 1 MB or smaller." });

    const first = await updateProfile(form({ fullName: "Ada", avatar: new File([PNG], "a.png", { type: "image/png" }) }));
    expect(first.ok).toBe(true);
    const url1 = (first as { avatarUrl: string }).avatarUrl;
    expect(url1).toContain(`/object/public/${AVATAR_BUCKET}/${me.id}/`);
    expect((await fetch(url1)).status).toBe(200);

    const second = await updateProfile(form({ fullName: "Ada", avatar: new File([PNG], "b.png", { type: "image/png" }) }));
    const url2 = (second as { avatarUrl: string }).avatarUrl;
    expect(url2).not.toBe(url1);
    expect(await supabaseStorage.exists(AVATAR_BUCKET, avatarPathFromUrl(url1)!)).toBe(false);
    expect(await supabaseStorage.exists(AVATAR_BUCKET, avatarPathFromUrl(url2)!)).toBe(true);

    expect(await updateProfile(form({ fullName: "Ada", removeAvatar: "on" }))).toEqual({ ok: true, avatarUrl: null });
    expect((await svc.from("profiles").select("avatar_url").eq("id", me.id).single()).data!.avatar_url).toBeNull();
    expect(await supabaseStorage.exists(AVATAR_BUCKET, avatarPathFromUrl(url2)!)).toBe(false);
  });

  it("only full_name and avatar_url are writable, and only on your own profile", async () => {
    const status = await me.client.from("profiles").update({ status: "suspended" }).eq("id", me.id).select("id");
    expect(status.error).not.toBeNull();
    expect((await svc.from("profiles").select("status").eq("id", me.id).single()).data!.status).toBe("active");
    const theirs = await me.client.from("profiles").update({ full_name: "Hacked" }).eq("id", other.id).select("id");
    expect(theirs.error !== null || (theirs.data ?? []).length === 0).toBe(true);
    expect((await svc.from("profiles").select("full_name").eq("id", other.id).single()).data!.full_name).not.toBe("Hacked");
    const tooLong = await me.client.from("profiles").update({ full_name: "y".repeat(101) }).eq("id", me.id);
    expect(tooLong.error).not.toBeNull();
  });

  it("changes the password only with the correct current one, validated", async () => {
    currentClient = me.client;
    expect(await changePassword({ current: me.password, next: "short", confirm: "short" })).toMatchObject({ ok: false, fieldErrors: { next: expect.any(String) } });
    expect(await changePassword({ current: "wrong-password", next: "a-brand-new-pass", confirm: "a-brand-new-pass" })).toEqual({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { current: "That is not your current password." },
    });
    expect(await changePassword({ current: me.password, next: "a-brand-new-pass", confirm: "a-brand-new-pass" })).toEqual({ ok: true });

    const old = await anon().auth.signInWithPassword({ email: me.email, password: me.password });
    expect(old.error).not.toBeNull();
    const fresh = await anon().auth.signInWithPassword({ email: me.email, password: "a-brand-new-pass" });
    expect(fresh.error).toBeNull();
  });
});
