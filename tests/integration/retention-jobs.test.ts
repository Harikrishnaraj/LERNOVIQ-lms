import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

// F-442 (T-284): purge_operational_data() deletes only rows past their retention period and is not
// callable by signed-in users. Live Supabase.
describe.skipIf(!hasLiveProject)("retention jobs (T-284, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ret");
  const userIds: string[] = [];

  afterAll(async () => {
    await svc.from("enquiries").delete().like("email", `%${tag}%`);
    await cleanup(svc, { userIds });
  });

  it("removes expired log rows, keeps recent ones, and refuses signed-in users", async () => {
    const learner = await createUserWithRole(svc, `${tag}-l`, "learner");
    userIds.push(learner.id);

    await svc.from("login_history").insert([
      { user_id: learner.id, created_at: daysAgo(400) },
      { user_id: learner.id, created_at: daysAgo(10) },
    ]);
    await svc.from("api_request_log").insert([
      { method: "GET", path: `/old-${tag}`, status_code: 200, created_at: daysAgo(100) },
      { method: "GET", path: `/new-${tag}`, status_code: 200, created_at: daysAgo(1) },
    ]);
    const mail = (n: string) => `${n}-${tag}@example.com`;
    const enquiry = (email: string, created_at: string) => ({
      kind: "demo", name: "T", email, organization: "T", country: "T", industry: "T", solution: "T", details: "T", created_at,
    });
    const { error: enqErr } = await svc.from("enquiries").insert([enquiry(mail("old"), daysAgo(800)), enquiry(mail("new"), daysAgo(5))]);
    expect(enqErr).toBeNull();

    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    await client.auth.signInWithPassword({ email: learner.email, password: learner.password });
    const { error: deniedErr } = await client.rpc("purge_operational_data");
    expect(deniedErr).not.toBeNull();

    const { data, error } = await svc.rpc("purge_operational_data");
    expect(error).toBeNull();
    expect(data.login_history).toBeGreaterThanOrEqual(1);
    expect(data.api_request_log).toBeGreaterThanOrEqual(1);
    expect(data.enquiries).toBeGreaterThanOrEqual(1);

    const logins = await svc.from("login_history").select("id").eq("user_id", learner.id);
    expect(logins.data).toHaveLength(1);
    const reqs = await svc.from("api_request_log").select("path").like("path", `%-${tag}`);
    expect(reqs.data?.map((r) => r.path)).toEqual([`/new-${tag}`]);
    const enq = await svc.from("enquiries").select("email").like("email", `%${tag}%`);
    expect(enq.data?.map((r) => r.email)).toEqual([mail("new")]);

    await svc.from("api_request_log").delete().like("path", `%-${tag}`);
  });
});
