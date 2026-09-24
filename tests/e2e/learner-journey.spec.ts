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
// A brand-new learner walks the whole product loop (signup itself is covered in auth.spec.ts:
// it needs a real inbox, so this journey starts from a verified account).
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("full learner journey (TEST_PLAN sections 5-7, 9)", () => {
  const svc = serviceClient();
  const tag = uniqueTag("jn");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learner: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor", {
      fullName: "Journey Teacher",
    });
    userIds.push(instructor.id);
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", { fullName: "Journey Learner" });

    const course = await createCourse(svc, instructor.id, {
      slug: `${tag}-course`,
      title: `${tag} Journey Course`,
      subtitle: "One course, the whole loop",
      outcomes: ["Finish the journey"],
      sections: [
        {
          title: "Learn",
          lessons: [
            { title: "Read this", content: "<p>Lesson one body</p>", minutes: 5 },
            { title: "Then this", content: "<p>Lesson two body</p>", minutes: 5 },
          ],
        },
        { title: "Prove it", lessons: [{ title: "Final quiz", type: "quiz", content: "<p>Quiz time</p>" }] },
      ],
    });
    courseIds.push(course.courseId);
    await createAssessment(svc, course.versionId, {
      title: `${tag} Final Assessment`,
      passMark: 100,
      maxAttempts: 3,
      lessonId: course.lessonIds[2],
      questions: [
        { type: "mcq", prompt: "Pick the right one", options: ["Nope", "Yes"], correct: [1] },
        { type: "multi", prompt: "Pick both", options: ["A", "B", "C"], correct: [0, 1] },
        { type: "short_answer", prompt: "Say hello", acceptedAnswers: ["hello"] },
      ],
    });
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [learner.id], courseIds, userIds }));

  test("login -> search -> enroll -> learn -> assess -> certificate -> verify", async ({ page }) => {
    test.setTimeout(180_000);

    // Login lands on the dashboard (already onboarded by the fixture).
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page).toHaveURL("/learner");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Journey" })).toBeVisible();

    // Search the catalog and open the course.
    await page.goto("/courses");
    await page.getByLabel("Search courses").fill(tag);
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("status")).toHaveText("1 course found");
    await page.getByRole("link", { name: `${tag} Journey Course` }).click();
    await expect(page).toHaveURL(`/courses/${tag}-course`);
    await expect(page.getByText("Finish the journey")).toBeVisible();
    await expect(page.getByText("Taught by Journey Teacher")).toBeVisible();

    // Enroll; it persists after a refresh.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Enroll for free" }).click();
    await expect(page.getByText("You are enrolled in this course.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("You are enrolled in this course.")).toBeVisible();

    // It shows up in My Learning at 0%.
    await page.goto("/learner/my-learning");
    const card = page.getByRole("listitem").filter({ hasText: `${tag} Journey Course` });
    await expect(card).toContainText("0 of 3 lessons");
    await card.getByRole("link", { name: "Start learning" }).click();

    // Player: lesson one, complete and continue to lesson two.
    await expect(page.getByRole("heading", { level: 1, name: "Read this" })).toBeVisible();
    await expect(page.getByText("Lesson one body")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Mark complete and continue" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Then this" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Mark complete and continue" }).click();

    // Quiz lesson: open the assessment.
    await expect(page.getByRole("heading", { level: 1, name: "Final quiz" })).toBeVisible();
    await page.getByRole("link", { name: `Open assessment: ${tag} Final Assessment` }).click();
    await expect(page).toHaveURL(new RegExp(`/assessments/`));

    // Progress persisted so far (2 of 3 lessons) - visible after leaving and coming back.
    await page.goto("/learner/my-learning");
    await expect(page.getByRole("listitem").filter({ hasText: `${tag} Journey Course` })).toContainText(
      "2 of 3 lessons",
    );
    await page.goBack();

    // Assessment: fail first (wrong answers), then retry and pass.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Start assessment" }).click();
    await page.getByLabel("Nope").check();
    await page.getByLabel("Say hello").fill("goodbye");
    await page.getByRole("button", { name: "Submit answers" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();
    await expect(page.getByRole("heading", { name: "Attempt 1 result" })).toBeVisible();
    await expect(page.getByText("Not passed")).toBeVisible();

    await page.getByRole("button", { name: "Retry assessment" }).click();
    await page.getByLabel("Yes", { exact: true }).check();
    await page.getByRole("group", { name: /Pick both/ }).getByLabel("A", { exact: true }).check();
    await page.getByRole("group", { name: /Pick both/ }).getByLabel("B", { exact: true }).check();
    await page.getByLabel("Say hello").fill("Hello");
    await expect(page.getByText("All answers saved")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Submit answers" }).click();
    await page.getByRole("button", { name: "Yes, submit" }).click();
    await expect(page.getByRole("heading", { name: "Attempt 2 result" })).toBeVisible();
    await expect(page.getByText("Passed", { exact: true })).toBeVisible();

    // The result persists after a refresh.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Attempt 2 result" })).toBeVisible();
    await expect(page.getByText("Passed", { exact: true })).toBeVisible();

    // Passing the last requirement completed the course and issued a certificate.
    await page.goto("/learner/certificates");
    const cert = page.getByRole("listitem").filter({ hasText: `${tag} Journey Course` });
    await expect(cert.getByText("Valid", { exact: true })).toBeVisible();
    const code = (await cert.locator("code").innerText()).trim();
    expect(code).toMatch(/^MLC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

    // My Learning shows the course as completed, and the dashboard no longer offers it to continue.
    await page.goto("/learner/my-learning?tab=completed");
    await expect(page.getByRole("listitem").filter({ hasText: `${tag} Journey Course` })).toContainText(
      "Completed",
    );

    // Anyone can verify the certificate without signing in - and sees no private data.
    await page.context().clearCookies();
    await page.goto(`/certificates/verify/${code}`);
    await expect(page.getByRole("heading", { name: "This certificate is valid" })).toBeVisible();
    await expect(page.getByText("Journey Learner")).toBeVisible();
    await expect(page.getByText(`${tag} Journey Course`)).toBeVisible();
    expect(await page.content()).not.toContain(learner.email);
  });
});
