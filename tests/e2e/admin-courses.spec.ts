import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-405: status tabs, search, views and bulk actions on the admin Courses screen.
test.describe("admin courses list", () => {
  const svc = serviceClient();
  const tag = uniqueTag("acl");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let pending: Awaited<ReturnType<typeof createCourse>>;
  let pending2: Awaited<ReturnType<typeof createCourse>>;
  let live: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    pending = await createCourse(svc, instructor.id, { slug: `${tag}-p1`, title: `${tag} Pending One`, publish: false });
    pending2 = await createCourse(svc, instructor.id, { slug: `${tag}-p2`, title: `${tag} Pending Two`, publish: false });
    live = await createCourse(svc, instructor.id, { slug: `${tag}-live`, title: `${tag} Live One`, publish: true });
    courseIds.push(pending.courseId, pending2.courseId, live.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).in("id", [pending.versionId, pending2.versionId]);
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  test("filters by tab and search, switches view, and bulk-starts reviews", async ({ page }) => {
    test.setTimeout(120_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/courses?q=${tag}`);
      await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
      const table = page.getByRole("table");
      await expect(table.getByRole("link", { name: `${tag} Pending One` })).toBeVisible();
      await expect(table.getByRole("link", { name: `${tag} Live One` })).toBeVisible();

      // Tab: only the pending ones.
      await page.getByRole("navigation", { name: "Course status" }).getByRole("link", { name: /^Pending review/ }).click();
      await expect(page).toHaveURL(/tab=pending/);
      await expect(table.getByRole("link", { name: `${tag} Live One` })).toHaveCount(0);
      await expect(table.getByRole("link", { name: `${tag} Pending Two` })).toBeVisible();

      // Search narrows further; an unmatched search gives the empty state.
      await page.getByLabel("Search courses").fill(`${tag} Pending One`);
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(table.getByRole("link", { name: `${tag} Pending Two` })).toHaveCount(0);
      await page.getByLabel("Search courses").fill("zzz-no-such-course");
      await page.getByRole("button", { name: "Apply" }).click();
      await expect(page.getByText("No courses match")).toBeVisible();

      // Grid view.
      await page.goto(`/admin/courses?q=${tag}&tab=pending&view=grid`);
      await expect(page.getByRole("link", { name: `${tag} Pending One` })).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);

      // Bulk: select both pending courses and start their review.
      await page.goto(`/admin/courses?q=${tag}&tab=pending`);
      await page.waitForLoadState("networkidle");
      await page.getByLabel(`Select ${tag} Pending One`).check();
      await page.getByLabel(`Select ${tag} Pending Two`).check();
      await expect(page.getByText("2 selected")).toBeVisible();
      await page.getByRole("button", { name: "Start review" }).click();
      await expect(page.getByText("2 updated.")).toBeVisible();
      await page.getByRole("navigation", { name: "Course status" }).getByRole("link", { name: /^Pending review/ }).click();
      await expect(page.getByRole("table").getByRole("link", { name: `${tag} Pending One` })).toBeVisible();
      const { data } = await svc.from("course_versions").select("status").in("id", [pending.versionId, pending2.versionId]);
      expect(data!.map((r) => r.status)).toEqual(["in_review", "in_review"]);
    } finally {
      await done();
    }
  });

  test("a support agent can browse but has no bulk actions; an instructor is denied", async ({ page }) => {
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto(`/admin/courses?q=${tag}`);
      await expect(page.getByRole("table").getByRole("link", { name: `${tag} Live One` })).toBeVisible();
      await expect(page.getByRole("toolbar", { name: "Bulk actions" })).toHaveCount(0);
    } finally {
      await done();
    }
    const other = await loginAsRole(page, "instructor");
    try {
      await page.goto("/admin/courses");
      await expect(page).toHaveURL(/permission-denied/);
    } finally {
      await other();
    }
  });
});
