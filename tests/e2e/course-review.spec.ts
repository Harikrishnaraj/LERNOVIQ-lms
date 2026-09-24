import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-406: inspect a submitted course, see the checklist, read a lesson, leave section-linked notes.
test.describe("course review screen", () => {
  const svc = serviceClient();
  const tag = uniqueTag("rv");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let c: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    c = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} To Review`,
      publish: false,
      description: "Too short",
      sections: [{ title: "Basics", lessons: [{ title: "Alpha lesson", content: "<p>Alpha body text</p>" }] }],
    });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    await svc.from("course_submissions").insert({ version_id: c.versionId, submitted_by: instructor.id, notes: "Please be gentle" });
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  test("shows details, checklist and instructor notes; adds and deletes a section note; opens a lesson", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/courses?q=${tag}`);
      await page.getByRole("link", { name: `${tag} To Review` }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/courses/${c.courseId}$`));
      await expect(page.getByRole("heading", { level: 1, name: `${tag} To Review` })).toBeVisible();

      await expect(page.getByText("Please be gentle")).toBeVisible();
      const checks = page.getByRole("list", { name: "Automatic checks" });
      await expect(checks.getByText("Thumbnail image - fails")).toBeVisible();
      await expect(checks.getByText("Course title - passes")).toBeVisible();

      // Section note: add, see it, delete it.
      await page.waitForLoadState("networkidle");
      await page.getByRole("button", { name: "Add note on section Basics" }).click();
      await page.getByLabel("Note on section Basics").fill("Split this section in two");
      await page.getByRole("button", { name: "Save note" }).click();
      const notes = page.getByRole("list", { name: "Notes on section Basics" });
      await expect(notes.getByText("Split this section in two")).toBeVisible();
      await page.reload();
      await expect(page.getByRole("list", { name: "Notes on section Basics" }).getByText("Split this section in two")).toBeVisible();
      await page.getByRole("button", { name: /Delete note: Split this section/ }).click();
      await expect(page.getByRole("list", { name: "Notes on section Basics" })).toHaveCount(0);

      // Empty note is refused.
      await page.getByRole("button", { name: "Add note on lesson Alpha lesson" }).click();
      await page.getByRole("button", { name: "Save note" }).click();
      await expect(page.getByText("Write a note first.")).toBeVisible();

      // Read the lesson as a learner would.
      await page.getByRole("link", { name: "Alpha lesson" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Alpha lesson" })).toBeVisible();
      await expect(page.getByText("Alpha body text")).toBeVisible();
      await page.getByRole("link", { name: /Back to review/ }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/courses/${c.courseId}$`));
    } finally {
      await done();
    }
  });

  test("a support agent reads the review but cannot add notes; unknown courses 404", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto(`/admin/courses/${c.courseId}`);
      await expect(page.getByRole("heading", { level: 1, name: `${tag} To Review` })).toBeVisible();
      await expect(page.getByRole("button", { name: /Add note/ })).toHaveCount(0);
      const res = await page.goto("/admin/courses/00000000-0000-4000-8000-000000000000");
      expect(res?.status()).toBe(404);
    } finally {
      await done();
    }
  });
});
