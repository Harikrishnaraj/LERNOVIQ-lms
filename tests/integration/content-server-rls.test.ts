import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const key = (n: number) => n.toString(16).padStart(64, "0");

// T-170 (F-520, ADR-038): content-server schema. Only `content_server.manage` (admin, super_admin)
// reads or writes clients, licences, licence courses and dispatches; registrations are written by
// the service role only; every other role (support agent, instructor, learner, anon) sees nothing.
describe.skipIf(!hasLiveProject)("content server schema RLS (T-170, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cs");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const clientIds: string[] = [];

  type U = { id: string; client: SupabaseClient };
  async function signedIn(name: string, role: string): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  let admin: U, superAdmin: U, support: U, instructor: U, learner: U;
  let courseA: string, courseB: string;
  let clientId: string, licenceId: string, dispatchId: string;

  beforeAll(async () => {
    [admin, superAdmin, support, instructor, learner] = await Promise.all([
      signedIn("adm", "admin"),
      signedIn("sup", "super_admin"),
      signedIn("sa", "support_agent"),
      signedIn("ins", "instructor"),
      signedIn("lrn", "learner"),
    ]);
    const a = await createCourse(svc, instructor.id, { slug: `${tag}-a`, title: `${tag} A`, publish: true });
    const b = await createCourse(svc, instructor.id, { slug: `${tag}-b`, title: `${tag} B`, publish: true });
    courseA = a.courseId;
    courseB = b.courseId;
    courseIds.push(courseA, courseB);

    const { data: c, error: ce } = await admin.client
      .from("content_clients")
      .insert({ name: `${tag} Acme Bank`, contact_email: "lms@acme.example", created_by: admin.id })
      .select("id")
      .single();
    if (ce) throw ce;
    clientId = c.id;
    clientIds.push(clientId);
    const { data: l, error: le } = await admin.client
      .from("content_licences")
      .insert({ client_id: clientId, name: "2026", seat_limit: 2, allowed_origins: ["https://lms.acme.example"] })
      .select("id")
      .single();
    if (le) throw le;
    licenceId = l.id;
    const { error: lce } = await admin.client.from("content_licence_courses").insert({ licence_id: licenceId, course_id: courseA });
    if (lce) throw lce;
    const { data: d, error: de } = await admin.client
      .from("content_dispatches")
      .insert({ licence_id: licenceId, course_id: courseA })
      .select("id, public_id")
      .single();
    if (de) throw de;
    dispatchId = d.id;
    expect(d.public_id).toMatch(/^[0-9a-f]{32}$/);
  }, 200_000);

  afterAll(async () => {
    if (clientIds.length) await svc.from("content_clients").delete().in("id", clientIds);
    await cleanup(svc, { courseIds, userIds });
  }, 120_000);

  it("lets admins and super admins read everything they manage", async () => {
    for (const u of [admin, superAdmin]) {
      const { data: clients } = await u.client.from("content_clients").select("id").eq("id", clientId);
      expect(clients).toHaveLength(1);
      const { data: dispatches } = await u.client.from("content_dispatches").select("id").eq("id", dispatchId);
      expect(dispatches).toHaveLength(1);
    }
  });

  it("hides every content-server table from support agents, instructors and learners", async () => {
    for (const u of [support, instructor, learner]) {
      for (const table of ["content_clients", "content_licences", "content_licence_courses", "content_dispatches", "content_registrations"]) {
        const { data } = await u.client.from(table).select("*").limit(5);
        expect(data ?? [], `${table} visible`).toHaveLength(0);
      }
      const { error } = await u.client.from("content_clients").insert({ name: `${tag} sneaky` });
      expect(error).not.toBeNull();
    }
  });

  it("gives anonymous callers nothing", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data } = await anon.from("content_dispatches").select("public_id");
    expect(data ?? []).toHaveLength(0);
  });

  it("only allows dispatches for courses the licence covers", async () => {
    const { error } = await admin.client.from("content_dispatches").insert({ licence_id: licenceId, course_id: courseB });
    expect(error).not.toBeNull();
  });

  it("does not let managers rewrite a dispatch's public ID", async () => {
    const { error } = await admin.client.from("content_dispatches").update({ public_id: "0".repeat(32) }).eq("id", dispatchId);
    expect(error).not.toBeNull();
  });

  it("rejects malformed embedding origins", async () => {
    for (const bad of ["lms.acme.example", "https://lms.acme.example/path", "javascript:alert(1)", "HTTPS://LMS.ACME.EXAMPLE"]) {
      const { error } = await admin.client.from("content_licences").insert({ client_id: clientId, name: "bad", allowed_origins: [bad] });
      expect(error, bad).not.toBeNull();
    }
  });

  it("lets only the service role write registrations, stores hashed learner keys, and counts seats per licence", async () => {
    const { error: denied } = await admin.client.from("content_registrations").insert({ dispatch_id: dispatchId, learner_key: key(1) });
    expect(denied).not.toBeNull();

    const { error: plain } = await svc.from("content_registrations").insert({ dispatch_id: dispatchId, learner_key: "learner@acme.example" });
    expect(plain).not.toBeNull();

    const { data: reg, error } = await svc
      .from("content_registrations")
      .insert([{ dispatch_id: dispatchId, learner_key: key(1) }, { dispatch_id: dispatchId, learner_key: key(2) }])
      .select("licence_id");
    expect(error).toBeNull();
    expect(reg!.every((r) => r.licence_id === licenceId)).toBe(true);

    const { error: dup } = await svc.from("content_registrations").insert({ dispatch_id: dispatchId, learner_key: key(1) });
    expect(dup).not.toBeNull();

    const { data: seats } = await admin.client.rpc("content_licence_seats_used", { p_licence_id: licenceId });
    expect(seats).toBe(2);
    const { data: hidden } = await learner.client.rpc("content_licence_seats_used", { p_licence_id: licenceId });
    expect(hidden).toBeNull();
  });

  it("revoking a licence keeps its history, and deleting a client removes all of it", async () => {
    const { error } = await admin.client
      .from("content_licences")
      .update({ revoked_at: new Date().toISOString(), revoked_by: admin.id })
      .eq("id", licenceId);
    expect(error).toBeNull();
    const { data: still } = await admin.client.from("content_dispatches").select("id").eq("licence_id", licenceId);
    expect(still).toHaveLength(1);

    const { data: temp } = await admin.client.from("content_clients").insert({ name: `${tag} Temp` }).select("id").single();
    const { data: tl } = await admin.client.from("content_licences").insert({ client_id: temp!.id, name: "t" }).select("id").single();
    await admin.client.from("content_clients").delete().eq("id", temp!.id);
    const { data: gone } = await svc.from("content_licences").select("id").eq("id", tl!.id);
    expect(gone).toHaveLength(0);
  });
});
