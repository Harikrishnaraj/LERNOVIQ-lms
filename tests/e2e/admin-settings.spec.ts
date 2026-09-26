import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { serviceClient } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "e2e-role-pass-1";

// F-416: Settings & Security (T-143)
test.describe("platform settings", () => {
  const svc = serviceClient();

  test.afterAll(async () => {
    await svc.from("platform_settings").update({ min_password_length: 8, mfa_required_portals: ["admin"], session_idle_timeout_minutes: null }).eq("id", true);
  });

  test("raises the minimum password length and it takes effect (T-143)", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/settings");
      await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

      await page.getByLabel("Minimum password length").fill("14");
      await page.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Saved.")).toBeVisible();

      await page.goto("/admin/profile");
      const pw = page.getByRole("form", { name: "Change password" });
      await pw.getByLabel("Current password").fill(PASSWORD);
      await pw.getByLabel("New password", { exact: true }).fill("short1");
      await pw.getByLabel("Confirm new password").fill("short1");
      await pw.getByRole("button", { name: "Change password" }).click();
      await expect(pw.getByText("Use at least 14 characters.")).toBeVisible();
    } finally {
      await done();
    }
  });
});
