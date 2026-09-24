import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-208: the instructor previews an unpublished course exactly as learners see it.
test.describe("course preview", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cp");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let draft: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    draft = await createCourse(svc, instructor.id, {
      slug: `${tag}-d`,
      title: `${tag} Draft`,
      publish: false,
      sections: [
        { title: "Basics", lessons: [{ title: "Alpha", minutes: 4, content: "<p>Alpha body</p>" }, { title: "Beta", minutes: 6, content: "<p>Beta body</p>" }] },
      ],
    });
    courseIds.push(draft.courseId);
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  test("opens on the first lesson, navigates, and is clearly a preview", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${draft.courseId}/pricing`);
    await page.getByRole("link", { name: /Next step: Preview/ }).click();

    await page.waitForURL(new RegExp(`/preview/${draft.lessonIds[0]}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible();
    await expect(page.getByText("Alpha body")).toBeVisible();
    await expect(page.getByText(/Preview: this is what learners see/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Mark as complete|Complete/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Beta" })).toBeVisible();
    await page.getByRole("navigation", { name: "Course content" }).getByRole("link", { name: /Alpha/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible();

    await page.getByRole("link", { name: "Back to editing" }).click();
    await expect(page).toHaveURL(/\/curriculum$/);
  });

  test("shows an empty state for a course with no lessons", async ({ page }) => {
    const empty = await createCourse(svc, instructor.id, { slug: `${tag}-e`, title: `${tag} Empty`, publish: false, sections: [] });
    courseIds.push(empty.courseId);
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${empty.courseId}/preview`);
    await expect(page.getByText("Nothing to preview yet")).toBeVisible();
    await page.getByRole("link", { name: "Go to curriculum" }).click();
    await expect(page).toHaveURL(/\/curriculum$/);
  });

  test("another instructor gets a 404", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other);
    const res = await page.goto(`/instructor/courses/${draft.courseId}/preview/${draft.lessonIds[0]}`);
    expect(res?.status()).toBe(404);
  });
});
