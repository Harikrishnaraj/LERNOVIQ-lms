import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-420, F-422: who can reach the report builder (T-278).
test.describe("report role isolation", () => {
  for (const role of ["learner", "instructor", "org_admin"] as const) {
    test(`a ${role} cannot open the admin report builder`, async ({ page }) => {
      test.setTimeout(120_000);
      const done = await loginAsRole(page, role);
      try {
        const res = await page.request.get("/admin/analytics", { maxRedirects: 0 });
        expect([302, 303, 307, 308, 403, 404]).toContain(res.status());
        await page.goto("/admin/analytics");
        await expect(page).not.toHaveURL(/\/admin\/analytics/);
        await expect(page.getByRole("heading", { name: "Saved reports" })).toHaveCount(0);
      } finally {
        await done();
      }
    });
  }

  test("a platform admin sees all nine reports in three categories, none disabled", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/analytics");
      await expect(page.getByRole("heading", { name: "Saved reports" })).toBeVisible();
      const select = page.getByLabel("Report type");
      await expect(select.locator("optgroup")).toHaveCount(3);
      await expect(select.locator("option")).toHaveCount(9);
      await expect(select.locator("option:disabled")).toHaveCount(0);
      await expect(select).not.toContainText("Not available yet");
    } finally {
      await done();
    }
  });
});
