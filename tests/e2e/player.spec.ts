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

// F-105 / TEST_PLAN section 6. Default storageState = the shared e2e learner.
test.describe("course player", () => {
  const svc = serviceClient();
  const tag = uniqueTag("pl");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learnerId: string;
  let enrolledCourse: Awaited<ReturnType<typeof createCourse>>;
  let otherCourse: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    learnerId = JSON.parse(readFileSync("tests/e2e/.auth/user.meta.json", "utf8")).userId;
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    enrolledCourse = await createCourse(svc, instructor.id, {
      slug: `${tag}-enrolled`,
      title: `${tag} Enrolled`,
      sections: [
        {
          title: "Part A",
          lessons: [
            {
              title: "First lesson",
              content:
                '<p>Hello learner</p><script>window.__xss=1</script><img src="https://example.com/x.png" onerror="window.__xss=1">',
            },
            { title: "Second lesson", content: "<p>Second body</p>" },
          ],
        },
        { title: "Part B", lessons: [{ title: "Third lesson", content: "<p>Third body</p>" }] },
      ],
    });
    otherCourse = await createCourse(svc, instructor.id, {
      slug: `${tag}-other`,
      title: `${tag} Other`,
      sections: [
        {
          title: "Only",
          lessons: [
            { title: "Free preview", preview: true, content: "<p>Preview body</p>" },
            { title: "Paid content", content: "<p>Locked body</p>" },
          ],
        },
      ],
    });
    courseIds.push(enrolledCourse.courseId, otherCourse.courseId);
    await svc.from("enrollments").insert({
      user_id: learnerId,
      course_id: enrolledCourse.courseId,
      version_id: enrolledCourse.versionId,
    });
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  test("continue lands on the first lesson; sidebar, prev/next and progress state work", async ({
    page,
  }) => {
    await page.goto(`/learner/courses/${tag}-enrolled`);
    await expect(page).toHaveURL(new RegExp(`/learn/${enrolledCourse.lessonIds[0]}$`));
    await expect(page.getByRole("heading", { level: 1, name: "First lesson" })).toBeVisible();
    await expect(page.getByText("Hello learner")).toBeVisible();
    await expect(page.getByText("Lesson 1 of 3")).toBeVisible();

    // Distraction-free: the learner portal chrome is gone.
    await expect(page.getByRole("complementary", { name: /navigation/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Certificates" })).toHaveCount(0);

    // Curriculum sidebar lists every lesson under its section, current one marked.
    const nav = page.getByRole("navigation", { name: "Course content" });
    await expect(nav.getByText("Part A")).toBeVisible();
    await expect(nav.getByText("Part B")).toBeVisible();
    await expect(nav.getByRole("link", { name: /First lesson/ })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Previous is absent on the first lesson; Next walks across sections.
    await expect(page.getByRole("link", { name: "Previous" })).toHaveCount(0);
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Second lesson" })).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Third lesson" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next" })).toHaveCount(0);
    await page.getByRole("link", { name: "Previous" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Second lesson" })).toBeVisible();

    // Jump via the sidebar.
    await nav.getByRole("link", { name: /First lesson/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "First lesson" })).toBeVisible();
  });

  test("lesson HTML is sanitized (no script execution)", async ({ page }) => {
    await page.goto(`/learner/courses/${tag}-enrolled/learn/${enrolledCourse.lessonIds[0]}`);
    await expect(page.getByText("Hello learner")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator("main script").count()).toBe(0);
  });

  test("a non-enrolled learner sees locks, can open the free preview, and cannot open locked lessons", async ({
    page,
  }) => {
    await page.goto(`/learner/courses/${tag}-other/learn/${otherCourse.lessonIds[0]}`);
    await expect(page.getByText("Preview body")).toBeVisible();
    await expect(page.getByText("You are previewing this course.")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Course content" });
    await expect(nav.getByText("Locked")).toBeAttached(); // sr-only lock label
    await expect(nav.getByRole("link", { name: /Paid content/ })).toHaveCount(0);

    // Direct URL to the locked lesson bounces to the course page.
    await page.goto(`/learner/courses/${tag}-other/learn/${otherCourse.lessonIds[1]}`);
    await expect(page).toHaveURL(`/courses/${tag}-other`);
    await expect(page.getByText("Locked body")).toHaveCount(0);
  });

  test("the entry route sends a non-enrolled learner to the course page", async ({ page }) => {
    await page.goto(`/learner/courses/${tag}-other`);
    await expect(page).toHaveURL(`/courses/${tag}-other`);
  });

  test("unknown lessons and courses are not found", async ({ page }) => {
    for (const path of [
      `/learner/courses/${tag}-enrolled/learn/not-a-uuid`,
      `/learner/courses/${tag}-enrolled/learn/00000000-0000-4000-8000-000000000000`,
      `/learner/courses/${tag}-missing`,
    ]) {
      await page.goto(path);
      await expect(page.getByText(/not found|404|could not be found/i).first()).toBeVisible();
    }
  });

  test("My Learning resume opens the player", async ({ page }) => {
    await page.goto("/learner/my-learning");
    const card = page.getByRole("listitem").filter({ hasText: `${tag} Enrolled` });
    await card.getByRole("link", { name: /Start learning|Resume/ }).click();
    await expect(page).toHaveURL(new RegExp(`/learn/${enrolledCourse.lessonIds[0]}$`));
  });

  test("works at 375px without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/learner/courses/${tag}-enrolled/learn/${enrolledCourse.lessonIds[0]}`);
    await expect(page.getByRole("heading", { level: 1, name: "First lesson" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
  });
});
