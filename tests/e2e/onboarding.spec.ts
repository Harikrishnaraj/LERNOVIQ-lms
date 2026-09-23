import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./support/env";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

test("a new learner is onboarded before reaching the learner portal", async ({ page }) => {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const email = `e2e-onboard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: "e2e-onboard-pass-1",
    email_confirm: true,
  });
  if (error) throw error;

  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("e2e-onboard-pass-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("/onboarding");

    await page.goto("/learner");
    await expect(page).toHaveURL("/onboarding");

    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Pick at least one" })).toBeVisible();

    await page.getByLabel("Design", { exact: true }).check();
    await page.getByLabel("Earn a certification").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL("/learner");

    const { data: row } = await db
      .from("learner_onboarding")
      .select("interests, goals")
      .eq("user_id", data.user.id)
      .single();
    expect(row).toEqual({ interests: ["design"], goals: ["certification"] });

    await page.goto("/onboarding");
    await expect(page).toHaveURL("/learner");
  } finally {
    await db.auth.admin.deleteUser(data.user.id);
  }
});
