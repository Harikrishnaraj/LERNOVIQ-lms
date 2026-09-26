import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { updatePlatformSettingsAction } from "@/features/admin/settings-actions";
import { getRecentSecurityEvents } from "@/features/admin/platform-settings";
import { getPlatformSettings } from "@/services/settings";
import { changePassword } from "@/features/profile/actions";
import { createUser } from "@/features/admin/user-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

type U = { id: string; email: string; password: string; client: SupabaseClient };

// F-416: Settings & Security (T-143), live Supabase.
describe.skipIf(!hasLiveProject)("platform settings (T-143, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("psx");
  const userIds: string[] = [];
  const createdUserIds: string[] = [];
  let admin: U;
  let plainLearner: U;

  async function user(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, email: u.email, password: u.password, client };
  }

  beforeAll(async () => {
    admin = await user("admin", "admin");
    plainLearner = await user("lrn", "learner");
  }, 200_000);

  afterAll(async () => {
    await svc.from("platform_settings").update({ min_password_length: 8, mfa_required_portals: ["admin"], session_idle_timeout_minutes: null }).eq("id", true);
    const { data } = await svc.auth.admin.listUsers();
    for (const u of data.users) {
      if (u.email?.startsWith(`${tag}-`)) createdUserIds.push(u.id);
    }
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds: [...userIds, ...createdUserIds] });
  }, 120_000);

  it("rejects a non-privileged user, and rejects an out-of-range update", async () => {
    currentClient = plainLearner.client;
    const blocked = await updatePlatformSettingsAction({ minPasswordLength: 10, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    expect(blocked.ok).toBe(false);

    currentClient = admin.client;
    const outOfRange = await updatePlatformSettingsAction({ minPasswordLength: 4, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    expect(outOfRange.ok).toBe(false);
    expect((await getPlatformSettings(admin.client)).minPasswordLength).toBe(8);
  });

  it("lets an admin raise the minimum password length, and a real password change then enforces it", async () => {
    currentClient = admin.client;
    const saved = await updatePlatformSettingsAction({ minPasswordLength: 14, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    expect(saved).toEqual({ ok: true });
    expect((await getPlatformSettings(admin.client)).minPasswordLength).toBe(14);

    currentClient = admin.client;
    const tooShort = await changePassword({ current: admin.password, next: "short-1234", confirm: "short-1234" });
    expect(tooShort).toMatchObject({ ok: false, fieldErrors: { next: "Use at least 14 characters." } });

    const { data } = await svc.from("audit_logs").select("id").eq("action", "settings.changed").eq("actor_id", admin.id);
    expect(data!.length).toBeGreaterThan(0);
  });

  it("never lets a configured minimum below 12 weaken admin-created accounts", async () => {
    currentClient = admin.client;
    await updatePlatformSettingsAction({ minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });

    currentClient = admin.client;
    const result = await createUser({ email: `${tag}-floor@example.com`, password: "short-pass1", fullName: "Floor Test", role: "learner" });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("12") });

    const ok = await createUser({ email: `${tag}-floor@example.com`, password: "a-strong-password-12", fullName: "Floor Test", role: "learner" });
    expect(ok).toEqual({ ok: true });
  });

  it("lists recent security events newest first, filtered to the curated action set", async () => {
    currentClient = admin.client;
    await updatePlatformSettingsAction({ minPasswordLength: 9, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
    const events = await getRecentSecurityEvents(admin.client, 5);
    expect(events[0]).toMatchObject({ action: "settings.changed", actorEmail: admin.email });
    expect(events.every((e) => e.createdAt <= events[0].createdAt)).toBe(true);
  });
});
