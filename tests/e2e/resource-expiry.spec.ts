import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const DAY = 86_400_000;
const isoDate = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

// F-430 (T-281): expired resources are hidden from lesson selection, with status badges and a pre-expiry warning.
test.describe("resource library expiry", () => {
  const svc = serviceClient();
  const tag = uniqueTag("resexpe2e");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let teacher: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor", { fullName: `${tag} Teacher` });
    userIds.push(teacher.id);
    const course = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: false,
      sections: [{ title: "S1", lessons: [{ title: "L1" }] }],
    });
    courseIds.push(course.courseId);
    const row = (name: string, expires: string | null) => ({
      owner_id: teacher.id,
      name,
      storage_path: `${teacher.id}/${name}.pdf`,
      mime_type: "application/pdf",
      size_bytes: 10,
      expires_at: expires,
    });
    const { error } = await svc.from("resource_library_items").insert([
      row(`${tag}-expired.pdf`, new Date(Date.now() - DAY).toISOString()),
      row(`${tag}-soon.pdf`, new Date(Date.now() + 5 * DAY).toISOString()),
      row(`${tag}-fine.pdf`, new Date(Date.now() + 90 * DAY).toISOString()),
    ]);
    if (error) throw error;
  });

  test.afterAll(async () => {
    await svc.from("resource_library_items").delete().eq("owner_id", teacher.id);
    await cleanup(svc, { learnerIds: [], courseIds, userIds });
  });

  test("shows status badges, warns before expiry and hides expired items from lesson selection", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
    await page.goto("/instructor/resources");

    const expired = page.locator("li").filter({ hasText: `${tag}-expired.pdf` });
    const soon = page.locator("li").filter({ hasText: `${tag}-soon.pdf` });
    const fine = page.locator("li").filter({ hasText: `${tag}-fine.pdf` });

    await expect(expired.getByText("Expired", { exact: true })).toBeVisible();
    await expect(expired.getByText(/hidden from learners/)).toBeVisible();
    await expect(expired.getByText("Attach to a lesson")).toHaveCount(0);

    await expect(soon.getByText("Expiring soon", { exact: true })).toBeVisible();
    await expect(soon.getByText(/expires soon/)).toBeVisible();
    await expect(soon.getByText("Attach to a lesson")).toBeVisible();

    await expect(fine.getByText("Active", { exact: true })).toBeVisible();
    await expect(fine.getByText("Attach to a lesson")).toBeVisible();

    // Extending the date brings an expired resource back into lesson selection.
    await expired.getByLabel("Expiry date (optional, UTC)").fill(isoDate(30));
    await expired.getByRole("button", { name: "Save expiry" }).click();
    await expect(expired.getByText("Expiry saved.")).toBeVisible({ timeout: 30_000 });
    await expect(expired.getByText("Attach to a lesson")).toBeVisible({ timeout: 30_000 });
    await expect(expired.getByText("Expired", { exact: true })).toHaveCount(0);
  });

  test("refuses a past expiry date", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
    await page.goto("/instructor/resources");

    const fine = page.locator("li").filter({ hasText: `${tag}-fine.pdf` });
    await fine.getByLabel("Expiry date (optional, UTC)").fill(isoDate(-3));
    await fine.getByRole("button", { name: "Save expiry" }).click();
    await expect(fine.getByRole("alert")).toContainText("must be in the future");
  });
});
