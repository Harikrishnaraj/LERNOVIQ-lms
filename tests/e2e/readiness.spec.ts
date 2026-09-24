import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-209: the readiness checklist lists what is missing, links to the fix, and turns green.
test.describe("readiness checklist", () => {
  const svc = serviceClient();
  const tag = uniqueTag("rc");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };

  async function signIn(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(instructor.email);
    await page.getByLabel("Password").fill(instructor.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  test("lists missing items with links, and a fully prepared course is ready", async ({ page }) => {
    test.setTimeout(120_000);
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-a`,
      title: `${tag} Course`,
      publish: false,
      sections: [{ title: "Main", lessons: [{ title: "Blank lesson", type: "text", content: "" }] }],
    });
    courseIds.push(c.courseId);
    await signIn(page);
    await page.goto(`/instructor/courses/${c.courseId}/readiness`);

    await expect(page.getByRole("status").filter({ hasText: /items? needs? your attention/ })).toBeVisible();
    const list = page.getByRole("list", { name: "Readiness checklist" });
    await expect(list.getByText("Thumbnail image - missing")).toBeVisible();
    await expect(list.getByText("Blank lesson", { exact: false }).first()).toBeVisible();

    await list.getByRole("link", { name: /Fix Every lesson has content/ }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${c.lessonIds[0]}$`));

    // Fill everything in, then the checklist is green.
    await createAssessment(svc, c.versionId, {
      title: "Final quiz",
      questions: [{ type: "true_false", prompt: "True?", options: ["True", "False"], correct: [0] }],
    });
    const { data: cat } = await svc.from("categories").select("id").limit(1).single();
    await svc.from("courses").update({ category_id: cat!.id }).eq("id", c.courseId);
    await svc.from("lessons").update({ content: "<p>Real content</p>" }).eq("id", c.lessonIds[0]);
    await svc.from("course_versions").update({
      description: "A complete description that is comfortably longer than the fifty character minimum.",
      outcomes: ["Learn things"],
      thumbnail_url: "https://example.com/t.png",
    }).eq("id", c.versionId);

    await page.goto(`/instructor/courses/${c.courseId}/readiness`);
    await expect(page.getByText("Your course is ready to submit for review.")).toBeVisible();
    await expect(page.getByRole("link", { name: /^Fix/ })).toHaveCount(0);
  });

  test("another instructor gets a 404", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-b`, title: `${tag} Other`, publish: false });
    courseIds.push(c.courseId);
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await page.goto("/login");
    await page.getByLabel("Email").fill(other.email);
    await page.getByLabel("Password").fill(other.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
    const res = await page.goto(`/instructor/courses/${c.courseId}/readiness`);
    expect(res?.status()).toBe(404);
  });
});
