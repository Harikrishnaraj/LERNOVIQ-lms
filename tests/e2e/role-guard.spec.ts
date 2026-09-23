import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";

// Uses the default storageState: a freshly signed-up user, i.e. a learner.
test("learner can open /learner", async ({ page }) => {
  await page.goto("/learner");
  await expect(page).toHaveURL("/learner");
});

for (const portal of ["instructor", "admin"] as const) {
  test(`learner is denied /${portal}`, async ({ page }) => {
    await page.goto(`/${portal}`);
    await expect(page).toHaveURL("/permission-denied");
  });

  test(`learner is denied /${portal} subpaths`, async ({ page }) => {
    await page.goto(`/${portal}/anything`);
    await expect(page).toHaveURL("/permission-denied");
  });
}

test("instructor reaches /instructor but is denied /admin and /learner", async ({ page }) => {
  const cleanup = await loginAsRole(page, "instructor");
  try {
    await expect(page).toHaveURL("/instructor");
    await page.goto("/admin");
    await expect(page).toHaveURL("/permission-denied");
    await page.goto("/learner");
    await expect(page).toHaveURL("/permission-denied");
  } finally {
    await cleanup();
  }
});

test("admin reaches /admin but is denied /instructor", async ({ page }) => {
  const cleanup = await loginAsRole(page, "admin");
  try {
    await expect(page).toHaveURL("/admin");
    await page.goto("/instructor");
    await expect(page).toHaveURL("/permission-denied");
  } finally {
    await cleanup();
  }
});
