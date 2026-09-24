import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { recordAudit } from "@/services/audit";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-414: append-only, server-written, readable only with audit.read.
describe.skipIf(!hasLiveProject)("audit logs (T-070, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("au");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let adminUser: { id: string; client: SupabaseClient };
  let instructor: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    adminUser = await user("adm", "admin");
    instructor = await user("ins", "instructor");
    learner = await user("lrn", "learner");
  }, 90_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds: [], userIds }), 60_000);

  it("recordAudit appends a row with actor, resource and metadata", async () => {
    const resourceId = `${tag}-res`;
    expect(
      await recordAudit({ actorId: adminUser.id, actorEmail: "a@example.com", action: "course.approved", resourceType: "course", resourceId, metadata: { note: "ok" } }),
    ).toBe(true);
    const { data } = await svc.from("audit_logs").select("actor_id, actor_email, action, resource_type, metadata").eq("resource_id", resourceId);
    expect(data).toEqual([{ actor_id: adminUser.id, actor_email: "a@example.com", action: "course.approved", resource_type: "course", metadata: { note: "ok" } }]);
  });

  it("is readable by audit readers only", async () => {
    const resourceId = `${tag}-read`;
    await recordAudit({ actorId: null, action: "settings.changed", resourceType: "settings", resourceId });
    const asAdmin = await adminUser.client.from("audit_logs").select("id").eq("resource_id", resourceId);
    expect(asAdmin.data).toHaveLength(1);
    for (const who of [instructor, learner]) {
      const r = await who.client.from("audit_logs").select("id").eq("resource_id", resourceId);
      expect(r.data ?? []).toEqual([]);
    }
    const anonymous = await anon().from("audit_logs").select("id").eq("resource_id", resourceId);
    expect(anonymous.data ?? []).toEqual([]);
  });

  it("cannot be written through the API by anyone, admins included", async () => {
    for (const who of [adminUser, instructor, learner]) {
      const { error } = await who.client.from("audit_logs").insert({ action: "user.suspended", resource_type: "user", actor_id: who.id });
      expect(error).not.toBeNull();
    }
    expect((await anon().from("audit_logs").insert({ action: "x", resource_type: "y" })).error).not.toBeNull();
  });

  it("is append-only even for the service role: update and delete are refused", async () => {
    const resourceId = `${tag}-imm`;
    await recordAudit({ actorId: null, action: "user.role_changed", resourceType: "user", resourceId });
    const upd = await svc.from("audit_logs").update({ action: "user.suspended" }).eq("resource_id", resourceId);
    expect(upd.error?.message).toContain("append-only");
    const del = await svc.from("audit_logs").delete().eq("resource_id", resourceId);
    expect(del.error?.message).toContain("append-only");
    const { data } = await svc.from("audit_logs").select("action").eq("resource_id", resourceId);
    expect(data).toEqual([{ action: "user.role_changed" }]);
  });

  it("recordAudit reports failure instead of throwing", async () => {
    const long = "x".repeat(200);
    // resource_type violates the length check.
    expect(await recordAudit({ actorId: null, action: "settings.changed", resourceType: long })).toBe(false);
  });
});
