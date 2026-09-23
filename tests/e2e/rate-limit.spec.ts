import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("repeated failed logins for one email are rate limited", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `nobody-${Date.now()}@example.com`;
  await page.goto("/login");
  for (let i = 0; i < 10; i++) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Invalid email or password." }),
    ).toBeVisible();
  }
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Too many attempts" })).toBeVisible();
});
