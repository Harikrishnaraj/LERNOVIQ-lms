import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { totp } from "./support/totp";

test("admin without a second factor is sent to /mfa and cannot reach /admin", async ({ page }) => {
  const cleanup = await loginAsRole(page, "admin", { mfa: false });
  try {
    await expect(page).toHaveURL(/\/mfa/);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/mfa\?next=%2Fadmin%2Fusers/);
  } finally {
    await cleanup();
  }
});

test("admin enrols TOTP, a wrong code is rejected, and a re-login requires the challenge", async ({
  page,
}) => {
  const cleanup = await loginAsRole(page, "admin", { mfa: false });
  try {
    const secret = (await page.getByTestId("mfa-secret").innerText()).trim();
    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toBeVisible();

    await page.getByLabel("Authentication code").fill(totp(secret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL("/admin");

    // Fresh session: enrolled now, so it is a challenge (no QR/secret shown).
    await page.context().clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(cleanup.email);
    await page.getByLabel("Password").fill("e2e-role-pass-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL(/\/mfa/);
    await expect(page.getByTestId("mfa-secret")).toHaveCount(0);
    await page.getByLabel("Authentication code").fill(totp(secret, Date.now() + 30000));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL("/admin");
  } finally {
    await cleanup();
  }
});
