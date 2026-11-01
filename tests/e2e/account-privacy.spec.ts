import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { loginAsRole } from "./support/role-user";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-943 (T-243, SECURITY.md §21): data export, and the account deletion request/cancel workflow.
test.describe("account privacy", () => {
  const svc = serviceClient();
  const tag = uniqueTag("priv");
  const userIds: string[] = [];

  let learner: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-l`, "learner", { fullName: `${tag} Learner` });
    userIds.push(learner.id);
  });

  test.afterAll(async () => {
    await cleanup(svc, { userIds });
  });

  test("downloads a data export, requests account deletion, then cancels it", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");

    await page.goto("/learner/settings");
    await expect(page.getByRole("heading", { name: "Privacy" })).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Download my data" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^my-data-.*\.json$/);

    // Identity check (F-441): a wrong password is refused and nothing is scheduled.
    const proof = page.getByLabel(/Confirm it is you/);
    await proof.fill("not-the-password");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText("That password is not correct.")).toBeVisible();
    await expect(page.getByText(/scheduled for deletion on/)).toHaveCount(0);

    await proof.fill(learner.password);
    await page.getByRole("button", { name: "Delete my account" }).click();
    await expect(page.getByText(/scheduled for deletion on/)).toBeVisible();

    await page.getByRole("button", { name: "Cancel deletion request" }).click();
    await expect(page.getByRole("button", { name: "Delete my account" })).toBeVisible();

    const { data } = await svc
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", learner.id)
      .maybeSingle();
    expect(data?.deletion_requested_at).toBeNull();
  });

  test("files a privacy request and an administrator sees it with its deadline", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
    await page.goto("/learner/settings");
    await page.getByLabel("What do you need?").selectOption("rectification");
    await page.getByLabel("Details (optional)").fill(`${tag} please fix my name`);
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText(/Request received\. We will reply by/)).toBeVisible();

    await page.context().clearCookies();
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/privacy-requests");
      const card = page.getByRole("listitem").filter({ hasText: `${tag} please fix my name` });
      await expect(card.getByText(/days left/)).toBeVisible();
      await card.getByLabel(/Note/).fill("Name corrected.");
      await card.getByLabel("Status").selectOption("completed");
      await card.getByRole("button", { name: "Save" }).click();
      await expect(page.getByText("Outcome: Name corrected.")).toBeVisible();
    } finally {
      await done();
    }
  });
});
