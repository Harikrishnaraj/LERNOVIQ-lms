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
// Own learner per worker (the shared e2e learner would accumulate other specs' assessments).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("learner assessments list", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ls");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learner: { id: string; email: string; password: string };
  let courseSlug: string;
  let freshId: string;

  async function signIn(page: import("@playwright/test").Page, u: typeof learner) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    courseSlug = `${tag}-c`;
    const course = await createCourse(svc, instructor.id, { slug: courseSlug, title: `${tag} Course` });
    courseIds.push(course.courseId);
    const q = [{ type: "mcq" as const, prompt: "Q", options: ["a", "b"], correct: [0] }];
    const fresh = await createAssessment(svc, course.versionId, { title: "Fresh quiz", questions: q });
    freshId = fresh.assessmentId;
    const done = await createAssessment(svc, course.versionId, { title: "Done quiz", passMark: 60, questions: q });
    const { data: enr } = await svc
      .from("enrollments")
      .insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId })
      .select("id")
      .single();
    await svc.from("assessment_attempts").insert({
      assessment_id: done.assessmentId,
      enrollment_id: enr!.id,
      user_id: learner.id,
      attempt_number: 1,
      status: "graded",
      percent: 85,
      passed: true,
      submitted_at: new Date().toISOString(),
    });
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [learner.id], courseIds, userIds }));

  test("splits upcoming from completed, shows results, and links to the assessment", async ({ page }) => {
    await signIn(page, learner);
    await page.goto("/learner/assessments");
    await expect(page.getByRole("heading", { level: 1, name: "Assessments" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Upcoming/ })).toContainText("(1)");
    await expect(page.getByRole("link", { name: /Completed/ })).toContainText("(1)");

    const fresh = page.getByRole("listitem").filter({ hasText: "Fresh quiz" });
    await expect(fresh.getByText("Not started")).toBeVisible();
    await expect(fresh.getByText("0 (unlimited)")).toBeVisible();
    await expect(page.getByText("Done quiz")).toHaveCount(0);

    await page.getByRole("link", { name: /Completed/ }).click();
    const done = page.getByRole("listitem").filter({ hasText: "Done quiz" });
    await expect(done.getByText("Passed", { exact: true })).toBeVisible();
    await expect(done.getByText("85%").first()).toBeVisible();
    await expect(done.getByText("Pass mark")).toBeVisible();

    await page.goto("/learner/assessments");
    await page.getByRole("link", { name: "Start Fresh quiz" }).click();
    await expect(page).toHaveURL(`/learner/courses/${courseSlug}/assessments/${freshId}`);
  });

  test("a learner with no enrollments sees a helpful empty state", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-none`, "learner");
    try {
      await signIn(page, other);
      await page.goto("/learner/assessments");
      await expect(page.getByText("No assessments yet")).toBeVisible();
      await page.getByRole("link", { name: /Completed/ }).click();
      await expect(page.getByText("No results yet")).toBeVisible();
    } finally {
      await svc.auth.admin.deleteUser(other.id);
    }
  });
});
