import { afterAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { getMyOrganizationId } from "@/features/admin/organizations";
import { can } from "@/lib/permissions/can";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-501: Org Admin scoped portal access (T-162) -- org_admin gets its own portal permission,
// never the full admin console, and can only ever resolve its own organization.
describe.skipIf(!hasLiveProject)("org admin scoped portal (T-162, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("oap");
  const userIds: string[] = [];
  const orgIds: string[] = [];

  it("org_admin has the scoped portal permission, never the admin console", async () => {
    const u = await createUserWithRole(svc, `${tag}-role`, "org_admin");
    userIds.push(u.id);
    expect(await can(svc, u.id, "portal.org_admin.access")).toBe(true);
    expect(await can(svc, u.id, "portal.admin.access")).toBe(false);
  });

  it("resolves my_organization_id to the caller's own org, or null when unassigned", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    async function signedIn(name: string) {
      const u = await createUserWithRole(svc, `${tag}-${name}`, "org_admin");
      userIds.push(u.id);
      const client = anon();
      const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw error;
      return { id: u.id, client };
    }

    const unassigned = await signedIn("none");
    expect(await getMyOrganizationId(unassigned.client)).toBeNull();

    const { data: org } = await svc.from("organizations").insert({ name: `${tag} Org`, slug: `${tag}-org` }).select("id").single();
    orgIds.push(org!.id);
    const assigned = await signedIn("yes");
    await svc.from("organization_members").insert({ organization_id: org!.id, user_id: assigned.id, org_role: "org_admin" });
    expect(await getMyOrganizationId(assigned.client)).toBe(org!.id);
  });

  it("an org admin can rename their own organization but not another's", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    type U = { id: string; client: SupabaseClient };
    async function signedIn(name: string): Promise<U> {
      const u = await createUserWithRole(svc, `${tag}-${name}`, "org_admin");
      userIds.push(u.id);
      const client = anon();
      const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
      if (error) throw error;
      return { id: u.id, client };
    }

    const { data: orgA } = await svc.from("organizations").insert({ name: `${tag} A`, slug: `${tag}-a` }).select("id").single();
    const { data: orgB } = await svc.from("organizations").insert({ name: `${tag} B`, slug: `${tag}-b` }).select("id").single();
    orgIds.push(orgA!.id, orgB!.id);

    const adminA = await signedIn("admin-a");
    await svc.from("organization_members").insert({ organization_id: orgA!.id, user_id: adminA.id, org_role: "org_admin" });

    const renamedOwn = await adminA.client.from("organizations").update({ name: "Renamed A" }).eq("id", orgA!.id).select("id");
    expect(renamedOwn.data).toHaveLength(1);

    const renamedOther = await adminA.client.from("organizations").update({ name: "Hacked B" }).eq("id", orgB!.id).select("id");
    expect((renamedOther.data ?? []).length).toBe(0);
    expect((await svc.from("organizations").select("name").eq("id", orgB!.id).single()).data!.name).toBe(`${tag} B`);
  });

  afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds: [], courseIds: [], userIds });
  }, 60_000);
});
