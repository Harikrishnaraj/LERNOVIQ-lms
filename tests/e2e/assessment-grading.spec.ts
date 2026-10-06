import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// T-252 (F-107, TEST_PLAN section 7): essay/coding answers are graded by the instructor, and a
// pass completes the course and issues the certificate.
test.describe("manual grading of essay answers", () => {
  const svc = serviceClient();
  const tag = uniqueTag("mge");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let learner: { id: string; email: string; password: string };
  let assessmentId: string;

  async function signIn(page: Page, u: { email: string; password: string }, landing: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(landing);
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: "Essay Writer" });
    userIds.push(instructor.id);
    learnerIds.push(learner.id);
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} Course`,
      sections: [{ title: "S", lessons: [{ title: "Final exam", type: "quiz" }] }],
    });
    courseIds.push(c.courseId);
    const a = await createAssessment(svc, c.versionId, {
      title: `${tag} Exam`,
      passMark: 70,
      maxAttempts: 2,
      lessonId: c.lessonIds[0],
      questions: [
        { type: "mcq", prompt: "Which is right?", options: ["Wrong", "Right"], correct: [1] },
        { type: "essay", prompt: "Explain recursion", points: 4 },
      ],
    });
    assessmentId = a.assessmentId;
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("learner submits an essay, instructor grades it, learner sees the result and certificate", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);

    // The learner answers and submits; the essay waits for the instructor.
    const lctx = await browser.newContext();
    const lp = await lctx.newPage();
    await signIn(lp, learner, "/learner");
    await lp.goto(`/learner/courses/${tag}-c/assessments/${assessmentId}`);
    await lp.waitForLoadState("networkidle");
    await lp.getByRole("button", { name: "Start assessment" }).click();
    await lp.getByLabel("Right", { exact: true }).check();
    await lp.getByLabel(/Explain recursion/).fill("A function that calls itself until it reaches a base case.");
    await expect(lp.getByText("All answers saved")).toBeVisible({ timeout: 15_000 });
    await lp.getByRole("button", { name: "Submit answers" }).click();
    await lp.getByRole("button", { name: "Yes, submit" }).click();
    await expect(lp.getByText("Awaiting instructor review")).toBeVisible();
    await expect(lp.getByText("Pending review")).toBeVisible();
    await expect(lp.getByText("Your instructor is grading your last attempt.")).toBeVisible();
    await expect(lp.getByRole("button", { name: "Retry assessment" })).toHaveCount(0);

    // The instructor finds it in the grading queue and grades it.
    await signIn(page, instructor, "/instructor");
    await page.goto("/instructor/grading");
    await page.getByRole("link", { name: "Essay & coding answers (1 to grade)" }).click();
    await expect(page.getByText("1 assessment attempt waiting for a grade.")).toBeVisible();
    await page.getByRole("list", { name: "Assessment attempts" }).getByRole("link", { name: `${tag} Exam` }).click();
    await page.waitForURL(/\/instructor\/grading\/attempts\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Essay Writer · attempt 1")).toBeVisible();
    await expect(page.getByText("A function that calls itself until it reaches a base case.")).toBeVisible();
    await expect(page.getByText("Graded automatically · 1 / 1 points")).toBeVisible();
    await page.waitForLoadState("networkidle");

    const form = page.getByRole("form", { name: "Grade this attempt" });
    await form.getByLabel("Points for question 2 (out of 4)").fill("5");
    await form.getByRole("button", { name: "Save grade" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Question 2: enter a whole number of points from 0 to 4." })).toBeVisible();
    await form.getByLabel("Points for question 2 (out of 4)").fill("3");
    await expect(form.getByText("Total: 4 / 5 points · 80% · passes (pass mark 70%)")).toBeVisible();
    await form.getByLabel("Feedback on question 2 (optional)").fill("Good, but mention the call stack.");
    await form.getByLabel("Overall feedback for the learner (optional)").fill("Well done overall.");
    await form.getByRole("button", { name: "Save grade" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Grade saved: 80%, passed. The learner was notified. They have now completed the course." }),
    ).toBeVisible();

    await page.goto("/instructor/grading?kind=assessments");
    await expect(page.getByText("No answers to grade")).toBeVisible();
    await page.goto("/instructor/grading?kind=assessments&filter=graded");
    await expect(page.getByText("Graded 80% · Passed")).toBeVisible();

    // The learner sees the score, the feedback and the certificate.
    await lp.reload();
    await expect(lp.getByText("Passed", { exact: true })).toBeVisible();
    await expect(lp.getByText("80%", { exact: true })).toBeVisible();
    await expect(lp.getByText("3 / 4 points")).toBeVisible();
    await expect(lp.getByText("Good, but mention the call stack.")).toBeVisible();
    await expect(lp.getByText("Well done overall.")).toBeVisible();
    await lp.goto("/learner/certificates");
    await expect(lp.getByText(`${tag} Course`)).toBeVisible();
    await lctx.close();
  });
});
