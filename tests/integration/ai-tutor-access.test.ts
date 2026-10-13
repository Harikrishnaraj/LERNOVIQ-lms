import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { hasTutorAccess } from "@/features/ai/policy";
import { getAiTutorAccess } from "@/features/admin/ai-access";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

// T-206 (ADR-043): AI Tutor access is off by default, readable by the user and admins only, and
// impossible for users to grant themselves.
describe.skipIf(!hasLiveProject)("per-user AI Tutor access (T-206, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aiacc");
  const learnerIds: string[] = [];
  const userIds: string[] = [];
  type U = { id: string; client: SupabaseClient };
  let approved: U, other: U, admin: U;

  async function user(name: string, role: string, opts: { fullName?: string } = {}): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, opts);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    approved = await user("ok", "learner");
    other = await user("no", "learner");
    admin = await user("adm", "admin", { fullName: `${tag} Admin` });
    await svc.from("ai_tutor_access").insert({ user_id: approved.id, granted_by: admin.id });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, userIds }), 120_000);

  it("is off by default and on only for users an admin enabled", async () => {
    expect(await hasTutorAccess(approved.client)).toBe(true);
    expect(await hasTutorAccess(other.client)).toBe(false);
    expect(await hasTutorAccess(admin.client)).toBe(false);
  });

  it("lets a user see their own access but not anyone else's", async () => {
    expect((await approved.client.from("ai_tutor_access").select("user_id")).data).toEqual([
      { user_id: approved.id },
    ]);
    expect((await other.client.from("ai_tutor_access").select("user_id")).data).toEqual([]);
  });

  it("shows admins who enabled a user and when", async () => {
    expect(await getAiTutorAccess(admin.client, approved.id)).toMatchObject({
      enabled: true,
      grantedByName: `${tag} Admin`,
      grantedAt: expect.any(String),
    });
    expect(await getAiTutorAccess(admin.client, other.id)).toEqual({
      enabled: false,
      grantedAt: null,
      grantedByName: null,
    });
  });

  it("gives users no way to enable or keep access themselves", async () => {
    const self = await other.client.from("ai_tutor_access").insert({ user_id: other.id });
    expect(self.error).not.toBeNull();
    const removal = await approved.client
      .from("ai_tutor_access")
      .delete()
      .eq("user_id", approved.id)
      .select("user_id");
    expect(removal.data ?? []).toEqual([]);
    // Even admins change access only through the audited server action (service role).
    const viaClient = await admin.client.from("ai_tutor_access").insert({ user_id: other.id });
    expect(viaClient.error).not.toBeNull();
    expect(await hasTutorAccess(other.client)).toBe(false);
  });

  it("removes access when it is turned off", async () => {
    await svc.from("ai_tutor_access").delete().eq("user_id", approved.id);
    expect(await hasTutorAccess(approved.client)).toBe(false);
  });

  it("refuses the check to anonymous callers", async () => {
    const { error } = await anon().rpc("has_ai_tutor_access");
    expect(error).not.toBeNull();
  });
});
