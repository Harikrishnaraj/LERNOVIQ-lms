import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createAssessment,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();

// F-100. A dedicated learner per worker: the dashboard only shows the 3 most recent courses, so the
// shared e2e learner (used by every spec) would make this flaky.
test.describe("learner dashboard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const svc = serviceClient();
  const tag = uniqueTag("dh");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learner: { id: string; email: string; password: string };
  const learnerId = () => learner.id;

  async function signIn(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} Dash Course`,
      sections: [{ title: "S", lessons: [{ title: "Dash lesson one" }, { title: "Dash lesson two" }] }],
    });
    courseIds.push(c.courseId);
    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: learnerId(), course_id: c.courseId, version_id: c.versionId })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert({
      enrollment_id: enr!.id,
      lesson_id: c.lessonIds[0],
      completed_at: new Date().toISOString(),
    });
    await createAssessment(svc, c.versionId, {
      title: `${tag} Dash Quiz`,
      questions: [{ type: "mcq", prompt: "Q", options: ["a", "b"], correct: [0] }],
    });
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [learner.id], courseIds, userIds }));

  test("shows the six blocks with real data and working links", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { level: 1, name: /^Welcome back, / })).toBeVisible();

    // Continue learning + today's learning + upcoming assessments reflect the seeded enrollment.
    await expect(page.getByRole("heading", { name: "Continue learning" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's learning" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Active learning path" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Upcoming assessments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended for you" })).toBeVisible();

    const quiz = page.getByRole("listitem").filter({ hasText: `${tag} Dash Quiz` });
    await expect(quiz).toBeVisible();
    const next = page.getByRole("link", { name: new RegExp(`Dash lesson two.*${tag}`) });
    await expect(next).toBeVisible();

    // Active path has an honest empty state until learning paths exist.
    await expect(page.getByText("No active path")).toBeVisible();

    await next.click();
    await expect(page).toHaveURL(/\/learn\//);
    await expect(page.getByRole("heading", { level: 1, name: "Dash lesson two" })).toBeVisible();
  });

  test("upcoming assessment links to the assessment page", async ({ page }) => {
    await signIn(page);
    const quiz = page.getByRole("listitem").filter({ hasText: `${tag} Dash Quiz` });
    await quiz.getByRole("link", { name: "Open" }).click();
    await expect(page).toHaveURL(new RegExp(`/learner/courses/${tag}-c/assessments/`));
  });
});

test.describe("learner dashboard empty states", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const svc = serviceClient();
  let user: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    user = await createUserWithRole(svc, uniqueTag("dhempty"), "learner");
  });
  test.afterAll(async () => {
    await svc.auth.admin.deleteUser(user.id);
  });

  test("a brand-new learner sees guidance, not blank cards", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");

    await expect(page.getByText("Pick a course and start learning.")).toBeVisible();
    await expect(page.getByText("Nothing to continue yet")).toBeVisible();
    await expect(page.getByText("You are all caught up")).toBeVisible();
    await expect(page.getByText("No active path")).toBeVisible();
    await expect(page.getByText("No assessments waiting")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse courses" }).first()).toBeVisible();
  });
});
