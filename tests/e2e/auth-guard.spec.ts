import { expect, test } from "@playwright/test";

// Runs unauthenticated — overrides the project's default storageState.
test.use({ storageState: { cookies: [], origins: [] } });

for (const portal of ["learner", "instructor", "admin"] as const) {
  test(`anonymous visit to /${portal} redirects to /login`, async ({ page }) => {
    await page.goto(`/${portal}`);
    await expect(page).toHaveURL(`/login?next=%2F${portal}`);
  });
}
