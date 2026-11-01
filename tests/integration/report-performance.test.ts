import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-420 (T-278): every report query answers quickly on the live database and stays within the 10,000-row cap.
// The database's own plans were checked with EXPLAIN when the queries were written (see docs/MEMORY.md).
const CALLS: [string, Record<string, number> | undefined][] = [
  ["admin_report_idle_users", { p_days: 30 }],
  ["admin_report_user_progress", { p_days: 30 }],
  ["admin_report_user_product_duration", { p_days: 30 }],
  ["admin_report_module_usage", { p_days: 30 }],
  ["admin_report_product_module_usage", undefined],
  ["admin_report_library_usage", { p_days: 30 }],
  ["admin_report_product_library_usage", undefined],
  ["admin_report_library_licence_status", undefined],
];

describe.skipIf(!hasLiveProject)("report query performance (T-278, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("repperf");
  const userIds: string[] = [];
  let admin: SupabaseClient;

  beforeAll(async () => {
    const adminUser = await createUserWithRole(svc, `${tag}-admin`, "admin");
    userIds.push(adminUser.id);
    admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await admin.auth.signInWithPassword({ email: adminUser.email, password: adminUser.password });
    if (error) throw error;
  }, 120_000);

  afterAll(() => cleanup(svc, { learnerIds: [], courseIds: [], userIds }), 120_000);

  it.each(CALLS)("%s answers within 5 seconds and returns at most 10,000 rows", async (fn, args) => {
    const started = Date.now();
    const { data, error } = await admin.rpc(fn, args);
    expect(error).toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
    expect((data ?? []).length).toBeLessThanOrEqual(10_000);
  });
});
