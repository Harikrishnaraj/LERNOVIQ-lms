import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-210: submit screen blocks an unready course, and submitting locks it with the notes recorded.
test.describe("submit for review", () => {
  const svc = serviceClient();
  const tag = uniqueTag("sr");
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

  test("an unready course cannot be submitted and points to the checklist", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-a`, title: `${tag} Unready`, publish: false });
    courseIds.push(c.courseId);
    await signIn(page);
    await page.goto(`/instructor/courses/${c.courseId}/submit`);
    await expect(page.getByText(/not ready to submit yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);
    await page.getByRole("link", { name: "Open the readiness checklist" }).click();
    await expect(page).toHaveURL(/\/readiness$/);
  });

  test("a ready course is submitted with notes and becomes locked", async ({ page }) => {
    test.setTimeout(120_000);
    const { data: cat } = await svc.from("categories").select("id").limit(1).single();
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-b`,
      title: `${tag} Ready`,
      publish: false,
      categoryId: cat!.id as string,
      description: "A complete description that is comfortably longer than the fifty character minimum.",
      outcomes: ["Learn things"],
    });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ thumbnail_url: "https://example.com/t.png" }).eq("id", c.versionId);
    await createAssessment(svc, c.versionId, {
      title: "Quiz",
      questions: [{ type: "true_false", prompt: "True?", options: ["True", "False"], correct: [0] }],
    });

    await signIn(page);
    await page.goto(`/instructor/courses/${c.courseId}/submit`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Notes for the reviewer/).fill("Please check the quiz.");
    await page.getByRole("button", { name: "Submit for review" }).click();

    await expect(page.getByText("Submitted. A reviewer will pick this up soon.")).toBeVisible();
    await expect(page.getByText("Please check the quiz.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit for review" })).toHaveCount(0);

    // Locked: the settings screen is now read-only.
    await page.goto(`/instructor/courses/${c.courseId}/pricing`);
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });

  test("another instructor gets a 404", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Other`, publish: false });
    courseIds.push(c.courseId);
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await page.goto("/login");
    await page.getByLabel("Email").fill(other.email);
    await page.getByLabel("Password").fill(other.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
    const res = await page.goto(`/instructor/courses/${c.courseId}/submit`);
    expect(res?.status()).toBe(404);
  });
});
