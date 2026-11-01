import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { recordConsent, withdrawConsent } from "@/features/privacy/consent";
import { CONSENT_PURPOSES, POLICY_VERSION } from "@/features/privacy/consent-purposes";
import { getMyDataExport } from "@/features/privacy/account";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-443 (T-285): consent keeps wording, policy version, time and withdrawal state. Live Supabase.
describe.skipIf(!hasLiveProject)("consent records (T-285, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cons");
  const userIds: string[] = [];

  afterAll(async () => {
    await svc.from("consent_records").delete().like("subject_email", `%${tag}%`);
    await cleanup(svc, { userIds });
  });

  it("records the exact wording and version, withdraws once, and shows owners only their own", async () => {
    const a = await createUserWithRole(svc, `${tag}-a`, "learner");
    const b = await createUserWithRole(svc, `${tag}-b`, "learner");
    userIds.push(a.id, b.id);

    expect((await recordConsent(svc, { purpose: "enquiry_contact", userId: a.id })).error).toBeNull();
    expect((await recordConsent(svc, { purpose: "enquiry_contact", userId: b.id })).error).toBeNull();
    const visitor = `Visitor-${tag}@example.com`;
    expect((await recordConsent(svc, { purpose: "enquiry_contact", email: visitor, sourceId: "e1" })).error).toBeNull();

    const rows = await svc.from("consent_records").select("*").eq("user_id", a.id);
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0]).toMatchObject({
      purpose: "enquiry_contact",
      purpose_text: CONSENT_PURPOSES.enquiry_contact.text,
      policy_version: POLICY_VERSION,
      withdrawn_at: null,
    });
    expect(rows.data![0].given_at).toBeTruthy();

    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: a.email, password: a.password });
    const own = await client.from("consent_records").select("user_id");
    expect(own.data?.map((r) => r.user_id)).toEqual([a.id]);
    const write = await client.from("consent_records").update({ withdrawn_at: new Date().toISOString() }).eq("user_id", a.id).select();
    expect(write.data ?? []).toHaveLength(0);

    const exported = await getMyDataExport(client, a.id);
    expect(exported.consents).toHaveLength(1);

    const first = await withdrawConsent(svc, { purpose: "enquiry_contact", email: visitor });
    expect(first.count).toBe(1);
    expect((await withdrawConsent(svc, { purpose: "enquiry_contact", email: visitor })).count).toBe(0);
    const after = await svc.from("consent_records").select("withdrawn_at").ilike("subject_email", visitor);
    expect(after.data![0].withdrawn_at).not.toBeNull();
  });
});
