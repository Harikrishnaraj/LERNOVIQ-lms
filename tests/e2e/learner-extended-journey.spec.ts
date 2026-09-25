import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssignment, createCourse, createPath, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// TEST_PLAN sections 5-8 across the extended learner features: path -> enroll -> lesson progress ->
// assignment -> discussion reply notification -> calendar and progress reflect it.
test.describe("learner extended journey", () => {
  const svc = serviceClient();
  const tag = uniqueTag("lej");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const pathIds: string[] = [];

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds, pathIds }));

  test("follows a path, enrolls, learns, hands in work, gets a reply notification, and sees it all", async ({ page, browser }) => {
    test.setTimeout(300_000);
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    const helper = await createUserWithRole(svc, `${tag}-hlp`, "learner");
    userIds.push(ins.id);
    learnerIds.push(learner.id, helper.id);
    const first = await createCourse(svc, ins.id, {
      slug: `${tag}-one`, title: `${tag} First Course`, publish: true,
      sections: [{ title: "Basics", lessons: [{ title: "Only lesson", minutes: 15, content: "<p>Lesson text</p>" }] }],
    });
    const second = await createCourse(svc, ins.id, { slug: `${tag}-two`, title: `${tag} Second Course`, publish: true });
    courseIds.push(first.courseId, second.courseId);
    const path = await createPath(svc, { slug: `${tag}-path`, title: `${tag} Path`, courseIds: [first.courseId, second.courseId] });
    pathIds.push(path.pathId);
    await svc.from("enrollments").insert({ user_id: helper.id, course_id: first.courseId, version_id: first.versionId });
    await createAssignment(svc, first.versionId, { title: `${tag} Report`, dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString() });

    // Path: follow it and see the ordered courses.
    await signIn(page, learner);
    await page.goto(`/learner/paths/${tag}-path`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Follow this path" }).click();
    await expect(page.getByRole("button", { name: "Stop following" })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(`Start with ${tag} First Course`) }).click();

    // Enroll in the first course from its public page.
    await expect(page.getByRole("heading", { level: 1, name: `${tag} First Course` })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Enroll for free" }).click();
    await expect(page.getByText("You are enrolled in this course.")).toBeVisible();

    // Learn: complete the only lesson.
    await page.goto(`/learner/courses/${tag}-one/learn/${first.lessonIds[0]}`);
    await expect(page.getByText("Lesson text")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Mark (lesson )?(as )?complete/i }).click();
    await expect(page.getByText(/You completed this course|Lesson completed/).first()).toBeVisible();

    // Assignment: submit text.
    await page.goto("/learner/assignments");
    await page.getByRole("link", { name: `${tag} Report` }).click();
    await page.waitForURL(/\/learner\/assignments\/[0-9a-f-]{36}$/);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Your answer").fill("My finished report.");
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("region", { name: "Your submission" }).getByText("My finished report.")).toBeVisible();

    // Discussion: the learner asks, a classmate replies, the bell lights up.
    await page.goto("/learner/discussions");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Start a discussion" }).click();
    const form = page.getByRole("form", { name: "Start a discussion" });
    await form.getByLabel("Title").fill(`${tag} Question`);
    await form.getByLabel("Your question or topic").fill("How should the report be structured?");
    await form.getByRole("button", { name: "Post discussion" }).click();
    await page.waitForURL(/\/learner\/discussions\/[0-9a-f-]{36}$/);
    const threadUrl = page.url();

    const hctx = await browser.newContext();
    const hp = await hctx.newPage();
    await signIn(hp, helper);
    await hp.goto(threadUrl);
    await hp.waitForLoadState("networkidle");
    await hp.getByLabel("Your reply").fill("Use an intro, body and summary.");
    await hp.getByRole("button", { name: "Post reply" }).click();
    await expect(hp.getByRole("list", { name: "Replies" }).getByText("Use an intro, body and summary.")).toBeVisible();
    await hctx.close();

    await page.goto("/learner");
    await expect(page.getByRole("link", { name: /Notifications, [1-9]\d* unread/ })).toBeVisible();
    await page.getByRole("link", { name: /Notifications, [1-9]\d* unread/ }).click();
    await page.getByRole("list", { name: "Notifications" }).getByRole("link", { name: `New reply: ${tag} Question` }).click();
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Question` })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Mark as answer" }).click();
    await expect(page.getByText("Answered", { exact: true }).first()).toBeVisible();

    // The calendar shows the deadline and the submission; progress shows the lesson time.
    await page.goto("/learner/calendar?view=agenda");
    const agenda = page.getByRole("list", { name: "Agenda" });
    await expect(agenda.getByRole("link", { name: new RegExp(`Due: ${tag} Report`) })).toBeVisible();
    await expect(agenda.getByRole("link", { name: new RegExp(`Submitted: ${tag} Report`) })).toBeVisible();
    await page.goto("/learner/progress");
    await expect(page.getByRole("region", { name: "Key numbers" }).getByText("15 min")).toBeVisible();
    await expect(page.getByRole("region", { name: "Key numbers" }).getByText("1 day", { exact: true })).toBeVisible();

    // The path now reflects the completed first course once it is marked complete.
    await page.goto(`/learner/paths/${tag}-path`);
    await expect(page.getByRole("list", { name: "Courses in this path" }).getByRole("listitem").first()).toContainText(`${tag} First Course`);
  });
});
