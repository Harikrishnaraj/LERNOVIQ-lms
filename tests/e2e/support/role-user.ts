import type { Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./env";

loadEnvLocal();

const PASSWORD = "e2e-role-pass-1";

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

// Creates a confirmed user whose only role is `role`, logs in through the UI
// and returns a cleanup function that deletes the user.
export async function loginAsRole(page: Page, role: string) {
  const db = admin();
  const email = `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;

  // New signups get "learner" by default (trigger); replace it.
  await db.from("user_roles").delete().eq("user_id", userId);
  const { error: roleError } = await db
    .from("user_roles")
    .insert({ user_id: userId, role_id: role });
  if (roleError) throw roleError;

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(learner|instructor|admin)$/);

  return () => db.auth.admin.deleteUser(userId);
}
