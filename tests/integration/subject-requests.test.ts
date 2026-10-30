import { afterAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/rate-limit", async (orig) => ({
  ...(await orig<typeof import("@/services/rate-limit")>()),
  clientIp: async () => "127.0.0.1",
  rateLimit: async () => true,
}));

import { submitSubjectRequestAction, updateSubjectRequestAction } from "@/features/privacy/request-actions";
import { listSubjectRequests } from "@/features/privacy/request-queries";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function signIn(u: { email: string; password: string }) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword(u);
  if (error) throw error;
  return c;
}

// F-444 (T-286): a person files a request, staff see it with a one-month deadline and close it with a
// note, every step is audited, and nobody else can read or change it. Live Supabase.
describe.skipIf(!hasLiveProject)("subject-rights requests (T-286, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("sr");
  const userIds: string[] = [];

  afterAll(async () => {
    await svc.from("subject_requests").delete().in("user_id", userIds);
    await cleanup(svc, { userIds });
  }, 120_000);

  it("files, tracks and closes a request with an audit trail and a one-month deadline", async () => {
    const learner = await createUserWithRole(svc, `${tag}-l`, "learner");
    const other = await createUserWithRole(svc, `${tag}-o`, "learner");
    const admin = await createUserWithRole(svc, `${tag}-a`, "admin");
    userIds.push(learner.id, other.id, admin.id);

    currentClient = await signIn(learner);
    expect(await submitSubjectRequestAction("erasure" as never, "x".repeat(2001))).toMatchObject({ ok: false });
    expect(await submitSubjectRequestAction("nonsense" as never, "")).toMatchObject({ ok: false });
    const filed = await submitSubjectRequestAction("access", "Please send everything you hold.");
    expect(filed.ok).toBe(true);

    const row = (await svc.from("subject_requests").select("*").eq("user_id", learner.id).single()).data!;
    expect(row).toMatchObject({ kind: "access", status: "open", requester_email: learner.email, completed_at: null });
    const spanDays = (new Date(row.due_at).getTime() - new Date(row.received_at).getTime()) / 86_400_000;
    expect(spanDays).toBeGreaterThanOrEqual(28);
    expect(spanDays).toBeLessThanOrEqual(31);

    // Others cannot see it; the owner cannot change its status.
    expect((await (await signIn(other)).from("subject_requests").select("id")).data).toHaveLength(0);
    const own = await currentClient.from("subject_requests").update({ status: "completed" }).eq("id", row.id).select();
    expect(own.data ?? []).toHaveLength(0);
    // Nor may someone file on another person's behalf.
    const forged = await currentClient
      .from("subject_requests")
      .insert({ user_id: other.id, requester_email: other.email, kind: "access" });
    expect(forged.error).not.toBeNull();
    expect(await updateSubjectRequestAction(row.id, "completed", "done")).toMatchObject({ ok: false });

    // Staff see it, must add a note to close it, and cannot reopen a closed one.
    currentClient = await signIn(admin);
    expect((await listSubjectRequests(currentClient)).map((r) => r.id)).toContain(row.id);
    expect(await updateSubjectRequestAction(row.id, "in_progress", "")).toEqual({ ok: true });
    expect(await updateSubjectRequestAction(row.id, "completed", "  ")).toMatchObject({ ok: false });
    expect(await updateSubjectRequestAction(row.id, "completed", "Export sent by email.")).toEqual({ ok: true });
    expect(await updateSubjectRequestAction(row.id, "in_progress", "")).toMatchObject({ ok: false });

    const done = (await svc.from("subject_requests").select("status, completed_at, handled_by, resolution_note").eq("id", row.id).single()).data!;
    expect(done).toMatchObject({ status: "completed", handled_by: admin.id, resolution_note: "Export sent by email." });
    expect(done.completed_at).not.toBeNull();

    const audit = await svc.from("audit_logs").select("action, actor_id").eq("resource_id", row.id).order("created_at");
    expect(audit.data?.map((a) => a.action)).toEqual(["privacy_request.created", "privacy_request.updated", "privacy_request.updated"]);
  });
});
