import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

// One address per run, so the per-IP limit never collides with other runs.
const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": ip }) }));

import { submitEnquiry } from "@/features/enquiries/actions";
import type { EnquiryInput } from "@/features/enquiries/schema";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

// T-264 (F-963, SECURITY §28): the contact form stores validated enquiries through the service
// role; only `enquiry.read` (admin, super_admin) can read them; nobody can insert directly.
describe.skipIf(!hasLiveProject)("contact enquiries (T-264, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("enq");
  const email = `${tag}@example.com`;
  const userIds: string[] = [];

  async function signedIn(name: string, role: string): Promise<SupabaseClient> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    userIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return client;
  }

  // Overrides may be deliberately invalid, so the result is cast to the action's input type.
  const enquiry = (overrides: Record<string, unknown> = {}) =>
    ({
      kind: "demo" as const,
      name: `${tag} Asha`,
      email,
      organization: `${tag} Bank`,
      country: "India",
      industry: "Banking, Financial Services & Insurance" as const,
      solution: "LERNOVIQ LMS & Learning Technology" as const,
      audience: "100–1,000" as const,
      timeline: "",
      details: "Please show us the LMS.",
      consent: true as const,
      ...overrides,
    }) as EnquiryInput;

  let admin: SupabaseClient;
  let support: SupabaseClient;
  let learner: SupabaseClient;

  beforeAll(async () => {
    admin = await signedIn("admin", "admin");
    support = await signedIn("sup", "support_agent");
    learner = await signedIn("lrn", "learner");
  }, 120_000);

  afterAll(async () => {
    await svc.from("enquiries").delete().eq("email", email);
    await cleanup(svc, { userIds });
  }, 60_000);

  it("stores a valid enquiry and rejects an invalid one without storing it", async () => {
    expect(await submitEnquiry(enquiry())).toEqual({ ok: true });
    const bad = await submitEnquiry(enquiry({ email: "nope", consent: false }));
    expect(bad).toMatchObject({
      ok: false,
      fieldErrors: { email: expect.any(String), consent: expect.any(String) },
    });

    const { data } = await svc
      .from("enquiries")
      .select("kind, organization, audience, timeline")
      .eq("email", email);
    expect(data).toEqual([
      { kind: "demo", organization: `${tag} Bank`, audience: "100–1,000", timeline: null },
    ]);
  });

  it("lets admins read enquiries; support agents, learners and anon see none", async () => {
    const asAdmin = await admin.from("enquiries").select("id").eq("email", email);
    expect(asAdmin.data).toHaveLength(1);
    for (const client of [support, learner, anon()]) {
      const { data } = await client.from("enquiries").select("id").eq("email", email);
      expect(data ?? []).toHaveLength(0);
    }
  });

  it("refuses direct inserts from anon and signed-in users", async () => {
    for (const client of [anon(), learner, admin]) {
      const { error } = await client.from("enquiries").insert({
        kind: "consultation",
        name: "x",
        email,
        organization: "x",
        country: "x",
        industry: "Other",
        solution: "Not sure yet",
        details: "x",
      });
      expect(error).not.toBeNull();
    }
  });

  it("rate-limits repeated enquiries from the same email", async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await submitEnquiry(enquiry());
    expect(last).toMatchObject({ ok: false, error: expect.stringMatching(/Too many attempts/) });
  });
});
