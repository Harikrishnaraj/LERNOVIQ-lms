import { expect, test } from "@playwright/test";

test("landing links to all three portals", async ({ page }) => {
  await page.goto("/");
  for (const name of ["learner", "instructor", "admin"]) {
    await expect(
      page.getByRole("link", { name: new RegExp(`open ${name} portal`, "i") }),
    ).toBeVisible();
  }
});

for (const [portal, target, heading] of [
  ["learner", "Certificates", "Certificates"],
  ["instructor", "Create Course", "Create Course"],
  ["admin", "Audit Logs", "Audit Logs"],
] as const) {
  test(`${portal} shell navigates to ${target}`, async ({ page, isMobile }) => {
    await page.goto(`/${portal}`);
    if (isMobile) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page
        .getByRole("dialog", { name: "Navigation" })
        .getByRole("link", { name: target })
        .click();
    } else {
      await page.getByRole("complementary").getByRole("link", { name: target }).click();
    }
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${portal}/`));
  });
}

test("unknown portal route is a 404", async ({ page }) => {
  const res = await page.goto("/learner/does-not-exist");
  expect(res?.status()).toBe(404);
});

test("learner bottom bar is visible on mobile only", async ({ page, isMobile }) => {
  await page.goto("/learner");
  const bar = page.getByRole("navigation", { name: "Primary" });
  if (isMobile) await expect(bar).toBeVisible();
  else await expect(bar).toBeHidden();
});
