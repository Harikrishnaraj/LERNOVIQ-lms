import { mkdirSync, writeFileSync } from "node:fs";
import { test as setup } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./support/env";

loadEnvLocal();

const AUTH_DIR = "tests/e2e/.auth";
const STORAGE_STATE = `${AUTH_DIR}/user.json`;
const META_FILE = `${AUTH_DIR}/user.meta.json`;
export const PASSWORD = "e2e-smoke-pass-1";

setup("authenticate", async ({ page }) => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const email = `e2e-smoke-${Date.now()}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  // Default new signup role is "learner" (T-018 role-aware redirect).
  await page.waitForURL("/learner");

  mkdirSync(AUTH_DIR, { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
  writeFileSync(META_FILE, JSON.stringify({ userId: data.user.id, email }));
});
