import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasLiveProject = Boolean(url && anonKey && serviceRoleKey);

// Uses the service-role admin API to create pre-confirmed test users, since
// "Confirm email" is ON (T-014) and signUp() no longer returns a session
// until the real inbox link is clicked.
describe.skipIf(!hasLiveProject)("profiles/roles/user_roles RLS (T-012, live Supabase)", () => {
  // persistSession: false — jsdom's localStorage is shared across every
  // client in this process, so a persisted session would leak between the
  // "anonymous" client and other tests' signed-in users.
  const noPersist = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = () => createClient(url!, serviceRoleKey!, noPersist);
  const anon = () => createClient(url!, anonKey!, noPersist);
  const password = "correct horse battery staple 1";
  const createdUserIds: string[] = [];

  afterEach(async () => {
    const client = admin();
    await Promise.all(createdUserIds.splice(0).map((id) => client.auth.admin.deleteUser(id)));
  });

  async function createAndSignIn(tag: string) {
    const email = `t012-test-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const { data, error } = await admin().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(data.user.id);

    const supabase = anon();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    return { supabase, userId: data.user.id };
  }

  it("seeds exactly the 7 roles from SECURITY.md §3", async () => {
    const { supabase } = await createAndSignIn("roles");
    const { data, error } = await supabase.from("roles").select("id").order("id");
    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toEqual([
      "admin",
      "content_reviewer",
      "instructor",
      "learner",
      "org_admin",
      "super_admin",
      "support_agent",
    ]);
  });

  it("blocks anonymous reads of profiles, roles and user_roles", async () => {
    const client = anon();
    const [profiles, roles, userRoles] = await Promise.all([
      client.from("profiles").select("id"),
      client.from("roles").select("id"),
      client.from("user_roles").select("user_id"),
    ]);
    expect(profiles.data).toEqual([]);
    expect(roles.data).toEqual([]);
    expect(userRoles.data).toEqual([]);
  });

  it("lets a signed-in user read only their own profile row", async () => {
    const a = await createAndSignIn("a");
    const b = await createAndSignIn("b");

    const { data: aProfiles } = await a.supabase.from("profiles").select("id");
    expect(aProfiles).toHaveLength(1);
    expect(aProfiles?.[0].id).toBe(a.userId);

    const { data: bProfiles } = await b.supabase.from("profiles").select("id");
    expect(bProfiles).toHaveLength(1);
    expect(bProfiles?.[0].id).toBe(b.userId);
  });

  it("auto-creates an active profile row on signup", async () => {
    const { supabase, userId } = await createAndSignIn("status");
    const { data } = await supabase.from("profiles").select("status").eq("id", userId).single();
    expect(data?.status).toBe("active");
  });
});
