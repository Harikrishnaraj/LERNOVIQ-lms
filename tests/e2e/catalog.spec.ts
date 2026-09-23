import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();
// Public page: run signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("public course catalog (F-101)", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cat");
  const courseIds: string[] = [];
  const userIds: string[] = [];

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor", {
      fullName: "Catalog Instructor",
    });
    userIds.push(instructor.id);
    // 13 matching courses -> two pages of 12; the first two are the ones we filter on.
    const defs = Array.from({ length: 13 }, (_, i) => ({
      slug: `${tag}-${i}`,
      title: `${tag} course ${i}`,
      level: i === 0 ? ("advanced" as const) : ("beginner" as const),
      priceCents: i === 0 ? 3000 : 0,
    }));
    for (const d of defs) {
      const created = await createCourse(svc, instructor.id, {
        ...d,
        ratingAvg: 4,
        ratingCount: 3,
      });
      courseIds.push(created.courseId);
    }
  });

  test.afterAll(async () => {
    await cleanup(svc, { courseIds, userIds });
  });

  test("is reachable signed out, and search + filters + pagination work", async ({ page }) => {
    await page.goto("/courses");
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();

    await page.getByLabel("Search courses").fill(tag);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page).toHaveURL(new RegExp(`q=${tag}`));
    await expect(page.getByRole("status")).toHaveText("13 courses found");
    await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(12);
    await expect(page.getByText("Page 1 of 2")).toBeVisible();

    await page.getByRole("link", { name: "Next" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByRole("list").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByText("Page 2 of 2")).toBeVisible();

    // A filter narrows the results and resets to page 1.
    await page.getByLabel("Level").selectOption("advanced");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("status")).toHaveText("1 course found");
    const card = page.getByRole("link", { name: `${tag} course 0` });
    await expect(card).toBeVisible();
    await expect(page.getByText("$30.00")).toBeVisible();
    await expect(page.getByText("By Catalog Instructor")).toBeVisible();

    // The card links to the course page.
    await expect(card).toHaveAttribute("href", `/courses/${tag}-0`);
  });

  test("shows an empty state with a way back when nothing matches", async ({ page }) => {
    await page.goto(`/courses?q=${tag}zzzznomatch`);
    await expect(page.getByRole("heading", { name: "No courses match your search" })).toBeVisible();
    await page.getByRole("link", { name: "Clear all filters" }).click();
    await expect(page).toHaveURL("/courses");
  });

  test("ignores invalid filter values instead of failing", async ({ page }) => {
    const res = await page.goto(
      "/courses?level=hacker&page=-3&sort=drop%20table&category=%27%3B--",
    );
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  });

  test("does not list unpublished courses", async ({ page }) => {
    const draftTag = uniqueTag("drf");
    const instructor = await createUserWithRole(svc, `${draftTag}-inst`, "instructor");
    const draft = await createCourse(svc, instructor.id, {
      slug: draftTag,
      title: `${draftTag} hidden`,
      publish: false,
    });
    try {
      await page.goto(`/courses?q=${draftTag}`);
      await expect(page.getByRole("status")).toHaveText("No courses found");
    } finally {
      await cleanup(svc, { courseIds: [draft.courseId], userIds: [instructor.id] });
    }
  });

  test("is usable at 375px without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/courses?q=${tag}`);
    await expect(page.getByRole("status")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
