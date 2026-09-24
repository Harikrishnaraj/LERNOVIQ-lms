import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { recordAudit } from "@/services/audit";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-400: KPIs and pending actions come from real data.
test.describe("admin overview", () => {
  const svc = serviceClient();
  const tag = uniqueTag("aov");
  const userIds: string[] = [];
  const courseIds: string[] = [];

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  test("shows KPIs, the review queue and recent activity from real data", async ({ page }) => {
    test.setTimeout(120_000);
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Awaiting Review`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);

    const done = await loginAsRole(page, "admin");
    try {
      await recordAudit({ actorId: done.userId, actorEmail: "reviewer@example.com", action: "course.approved", resourceType: "course", resourceId: `${tag}-x` });
      await page.goto("/admin");
      await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

      const kpis = page.getByRole("region", { name: "Key numbers" });
      for (const label of ["Users", "Instructors", "Published courses", "Enrollments", "Completions", "Certificates issued", "Awaiting review"]) {
        await expect(kpis.getByText(label, { exact: true })).toBeVisible();
      }

      const queue = page.getByRole("region", { name: "Courses awaiting review" }).or(page.locator("section").filter({ hasText: "Pending actions" }));
      await expect(queue.getByRole("link", { name: `${tag} Awaiting Review` })).toBeVisible();
      await expect(page.getByText("Course approved").first()).toBeVisible();
      await expect(page.getByText(/reviewer@example.com/).first()).toBeVisible();

      await queue.getByRole("link", { name: `${tag} Awaiting Review` }).click();
      await expect(page).toHaveURL(new RegExp(`/admin/courses/${c.courseId}`));
    } finally {
      await done();
    }
  });

  test("a support agent sees counts but not the review queue or audit feed", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto("/admin");
      await expect(page.getByRole("region", { name: "Key numbers" })).toBeVisible();
      await expect(page.getByText("Your role does not review courses.")).toBeVisible();
      await expect(page.getByText("Your role cannot view the audit log.")).toBeVisible();
    } finally {
      await done();
    }
  });

  test("an instructor cannot open the admin overview", async ({ page }) => {
    const done = await loginAsRole(page, "instructor");
    try {
      await page.goto("/admin");
      await expect(page).toHaveURL(/permission-denied/);
    } finally {
      await done();
    }
  });
});
