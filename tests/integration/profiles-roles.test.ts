import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const hasLiveProject = Boolean(url && anonKey);

// Requires "Confirm email" OFF on the Supabase project's Auth settings, so
// signUp() returns a session immediately (no service-role admin API used
// here). Test users are t012-test-*@example.com and aren't deleted after the
// run — there's no admin API without a service-role key.
describe.skipIf(!hasLiveProject)("profiles/roles/user_roles RLS (T-012, live Supabase)", () => {
  // persistSession: false — jsdom's localStorage is shared across every
  // client in this process, so a persisted session would leak between the
  // "anonymous" client and other tests' signed-in users.
  const client = () =>
    createClient(url!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const password = "correct horse battery staple 1";

  async function signUpAndSignIn(tag: string) {
    const supabase = client();
    const email = `t012-test-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) {
      throw new Error(
        'signUp returned no session — is "Confirm email" still on for this Supabase project?',
      );
    }
    return { supabase, userId: data.user!.id };
  }

  it("seeds exactly the 7 roles from SECURITY.md §3", async () => {
    const { supabase } = await signUpAndSignIn("roles");
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
    const anon = client();
    const [profiles, roles, userRoles] = await Promise.all([
      anon.from("profiles").select("id"),
      anon.from("roles").select("id"),
      anon.from("user_roles").select("user_id"),
    ]);
    expect(profiles.data).toEqual([]);
    expect(roles.data).toEqual([]);
    expect(userRoles.data).toEqual([]);
  });

  it("lets a signed-in user read only their own profile row", async () => {
    const a = await signUpAndSignIn("a");
    const b = await signUpAndSignIn("b");

    const { data: aProfiles } = await a.supabase.from("profiles").select("id");
    expect(aProfiles).toHaveLength(1);
    expect(aProfiles?.[0].id).toBe(a.userId);

    const { data: bProfiles } = await b.supabase.from("profiles").select("id");
    expect(bProfiles).toHaveLength(1);
    expect(bProfiles?.[0].id).toBe(b.userId);
  });

  it("auto-creates an active profile row on signup", async () => {
    const { supabase, userId } = await signUpAndSignIn("status");
    const { data } = await supabase.from("profiles").select("status").eq("id", userId).single();
    expect(data?.status).toBe("active");
  });
});
