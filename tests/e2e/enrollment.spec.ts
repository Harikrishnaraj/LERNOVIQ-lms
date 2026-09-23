import { readFileSync } from "node:fs";
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

// F-103. The default project storageState is the shared e2e learner (auth.setup.ts).
test.describe("enrollment", () => {
  const svc = serviceClient();
  const tag = uniqueTag("en");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learnerId: string;

  test.beforeAll(async () => {
    learnerId = JSON.parse(readFileSync("tests/e2e/.auth/user.meta.json", "utf8")).userId;
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    for (const [key, priceCents] of [
      ["free", 0],
      ["paid", 4900],
    ] as const) {
      const c = await createCourse(svc, instructor.id, {
        slug: `${tag}-${key}`,
        title: `${tag} ${key}`,
        priceCents,
      });
      courseIds.push(c.courseId);
    }
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  const enrollmentCount = async (slug: string) => {
    const { data: course } = await svc.from("courses").select("id").eq("slug", slug).single();
    const { count } = await svc
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course!.id)
      .eq("user_id", learnerId);
    return count;
  };

  test("a learner enrolls in a free course and it persists after refresh", async ({ page }) => {
    await page.goto(`/courses/${tag}-free`);
    // A click before hydration is a no-op; enrolling is idempotent so retrying is safe.
    await expect(async () => {
      await page.getByRole("button", { name: "Enroll for free" }).click({ timeout: 2000 });
      await expect(page.getByText("You are enrolled in this course.")).toBeVisible({
        timeout: 4000,
      });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByRole("link", { name: "Go to My Learning" })).toBeVisible();
    expect(await enrollmentCount(`${tag}-free`)).toBe(1);

    await page.reload();
    await expect(page.getByText("You are enrolled in this course.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enroll for free" })).toHaveCount(0);
    expect(await enrollmentCount(`${tag}-free`)).toBe(1);
  });

  test("a paid course cannot be enrolled in without payment", async ({ page }) => {
    await page.goto(`/courses/${tag}-paid`);
    await expect(page.getByRole("button", { name: /enroll/i })).toHaveCount(0);
    await expect(page.getByText("Paid enrollment is not available yet.")).toBeVisible();
    expect(await enrollmentCount(`${tag}-paid`)).toBe(0);
  });

  test("a signed-out visitor is asked to log in and returns to the course", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto(`/courses/${tag}-free`);
    await page.getByRole("link", { name: "Log in to enroll" }).click();
    await expect(page).toHaveURL(`/login?next=%2Fcourses%2F${tag}-free`);
    await context.close();
  });
});
