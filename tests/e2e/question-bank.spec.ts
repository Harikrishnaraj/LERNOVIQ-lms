import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-207: build a tagged bank, filter it, and import questions into an assessment.
test.describe("question bank", () => {
  const svc = serviceClient();
  const tag = uniqueTag("qbe");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let quiz: Awaited<ReturnType<typeof createAssessment>>;

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
    course = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: false });
    courseIds.push(course.courseId);
    quiz = await createAssessment(svc, course.versionId, { title: `${tag} Quiz`, questions: [] });
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  test("adds tagged questions, filters them, and imports one into an assessment", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, instructor);
    await page.goto("/instructor/question-bank");
    await expect(page.getByRole("heading", { level: 1, name: "Question Bank" })).toBeVisible();
    await expect(page.getByText("Your question bank is empty")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // A multiple-choice question with tags.
    await page.getByRole("button", { name: "Add question" }).click();
    await page.getByLabel("Tags (comma separated)").fill("Algebra, Warm up");
    await page.getByLabel("Question", { exact: true }).fill(`${tag} What is 2 + 2?`);
    await page.getByLabel("Option 1 text").fill("4");
    await page.getByLabel("Option 2 text").fill("5");
    await page.getByLabel("Option 1 is correct").check();
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(page.getByText("Question added to your bank.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Bank questions" }).getByText(`${tag} What is 2 + 2?`)).toBeVisible();

    // An essay question with a different tag.
    await page.getByRole("button", { name: "Add question" }).first().click();
    await page.getByLabel("Tags (comma separated)").fill("essays");
    await page.getByLabel("Question type").selectOption("essay");
    await page.getByLabel("Question", { exact: true }).fill(`${tag} Discuss testing`);
    await page.getByRole("button", { name: "Add question" }).last().click();
    await expect(page.getByRole("list", { name: "Bank questions" }).getByText(`${tag} Discuss testing`)).toBeVisible();

    // Filter by tag and by text.
    const list = page.getByRole("list", { name: "Bank questions" });
    await page.getByRole("navigation", { name: "Filter by tag" }).getByRole("link", { name: /^algebra/ }).click();
    await expect(page).toHaveURL(/tag=algebra/);
    await expect(list.getByText(`${tag} What is 2 + 2?`)).toBeVisible();
    await expect(list.getByText(`${tag} Discuss testing`)).toHaveCount(0);
    await page.goto(`/instructor/question-bank?q=nothing-like-this`);
    await expect(page.getByText("No questions match")).toBeVisible();

    // Import the algebra question into the assessment.
    await page.goto(`/instructor/courses/${course.courseId}/assessments/${quiz.assessmentId}`);
    await page.waitForLoadState("networkidle");
    const panel = page.getByRole("region", { name: "Question bank" });
    await panel.getByRole("checkbox", { name: new RegExp(`${tag} What is 2 \\+ 2`) }).check();
    await panel.getByRole("button", { name: /Import 1 selected/ }).click();
    await expect(panel.getByText("Imported 1 question.")).toBeVisible();
    await expect(page.getByText(`1. ${tag} What is 2 + 2?`).first()).toBeVisible();

    // Save that question back with a new tag, and delete a bank item.
    await page.waitForLoadState("networkidle");
    await panel.getByLabel("Tags (comma separated)").fill("imported");
    await panel.getByRole("button", { name: "Save to bank" }).click();
    await expect(panel.getByText("Saved to your question bank.")).toBeVisible();

    await page.goto("/instructor/question-bank?tag=essays");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: new RegExp(`Delete: ${tag} Discuss`) }).click();
    await page.getByRole("button", { name: "Delete question" }).click();
    await expect(page.getByText("Question deleted.")).toBeVisible();
  });

  test("another instructor has an empty bank and cannot see these questions", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other);
    await page.goto("/instructor/question-bank");
    await expect(page.getByText("Your question bank is empty")).toBeVisible();
    await expect(page.getByText(`${tag} What is 2 + 2?`)).toHaveCount(0);
  });
});
