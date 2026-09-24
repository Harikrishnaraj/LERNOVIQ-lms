import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_PAGE_SIZE, getAuditExport, getAuditPage, parseAuditQuery } from "@/features/admin/audit";
import { recordAudit } from "@/services/audit";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-414: filterable, paged and exportable audit reads, only for audit readers.
describe.skipIf(!hasLiveProject)("audit log queries (T-078, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aq");
  const userIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let admin: { id: string; client: SupabaseClient };
  let support: { id: string; client: SupabaseClient };
  const resource = `${tag}-res`;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }
  const q = (over: Record<string, string> = {}) => parseAuditQuery({ resourceId: resource, ...over });

  beforeAll(async () => {
    admin = await user("adm", "admin");
    support = await user("sup", "support_agent");
    await recordAudit({ actorId: admin.id, actorEmail: `alice-${tag}@example.com`, action: "course.approved", resourceType: "course", resourceId: resource });
    await recordAudit({ actorId: admin.id, actorEmail: `bob-${tag}@example.com`, action: "user.suspended", resourceType: "user", resourceId: resource, metadata: { reason: "test" } });
    await recordAudit({ actorId: admin.id, actorEmail: `alice-${tag}@example.com`, action: "course.rejected", resourceType: "course", resourceId: resource });
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds: [], userIds }), 120_000);

  it("returns newest first with a total, and filters by action, actor and resource type", async () => {
    const all = await getAuditPage(admin.client, q());
    expect(all.total).toBe(3);
    expect(all.rows.map((r) => r.action)).toEqual(["course.rejected", "user.suspended", "course.approved"]);
    expect((await getAuditPage(admin.client, q({ action: "user.suspended" }))).rows[0].metadata).toEqual({ reason: "test" });
    expect((await getAuditPage(admin.client, q({ actor: "ALICE" }))).total).toBe(2);
    expect((await getAuditPage(admin.client, q({ actor: `bob-${tag}` }))).total).toBe(1);
    expect((await getAuditPage(admin.client, q({ resourceType: "course" }))).total).toBe(2);
  });

  it("filters by date range (inclusive) and finds nothing outside it", async () => {
    const today = new Date().toISOString().slice(0, 10);
    expect((await getAuditPage(admin.client, q({ from: today, to: today }))).total).toBe(3);
    expect((await getAuditPage(admin.client, q({ to: "2020-01-01" }))).total).toBe(0);
    expect((await getAuditPage(admin.client, q({ from: "2999-01-01" }))).total).toBe(0);
  });

  it("treats wildcards in the actor filter literally", async () => {
    expect((await getAuditPage(admin.client, q({ actor: "%" }))).total).toBe(0);
    expect((await getAuditPage(admin.client, q({ actor: "_" }))).total).toBe(0);
  });

  it("pages, and exports every matching row", async () => {
    const page2 = await getAuditPage(admin.client, { ...q(), page: 2 });
    expect(page2.rows).toEqual([]);
    expect(page2.total).toBe(3);
    expect(AUDIT_PAGE_SIZE).toBe(50);
    const exported = await getAuditExport(admin.client, q({ action: "course.approved" }));
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ actorEmail: `alice-${tag}@example.com`, resourceId: resource });
  });

  it("gives nothing to roles without audit.read", async () => {
    expect((await getAuditPage(support.client, q())).total).toBe(0);
    expect(await getAuditExport(support.client, q())).toEqual([]);
    expect((await getAuditPage(anon(), q())).total).toBe(0);
  });
});
