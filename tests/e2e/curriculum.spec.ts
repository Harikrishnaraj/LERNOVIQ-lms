import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-203: sections/lessons CRUD, reorder with drag and with the keyboard/menu alternative.
test.describe("curriculum builder", () => {
  const svc = serviceClient();
  const tag = uniqueTag("cb");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let other: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }
  const lessonTitles = async (page: Page, section: string) =>
    page.getByRole("region", { name: section }).locator("[data-lesson-title]").allTextContents();

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(instructor.id, other.id);
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-c`,
      title: `${tag} Builder Course`,
      publish: false,
      sections: [],
    });
    courseIds.push(course.courseId);
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  test("build, rename, reorder (buttons and drag), move between sections and delete", async ({ page }) => {
    test.setTimeout(180_000);
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${course.courseId}/curriculum`);
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Builder Course` })).toBeVisible();
    await expect(page.getByText("Your curriculum is empty.")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Add two sections.
    await page.getByLabel("New section title").fill("Basics");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Basics" })).toBeVisible();
    await page.getByLabel("New section title").fill("Advanced");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Advanced" })).toBeVisible();

    // Add three lessons of different types to Basics.
    const basics = page.getByRole("region", { name: "Basics" });
    for (const [title, type] of [["Intro", "Video lesson"], ["Reading", "Text lesson"], ["Quiz one", "Quiz"]] as const) {
      await basics.getByLabel("New lesson title").fill(title);
      await basics.getByLabel("Type").selectOption({ label: type });
      await basics.getByRole("button", { name: /Add lesson/ }).click();
      await expect(basics.getByText(title, { exact: true })).toBeVisible();
    }
    expect(await lessonTitles(page, "Basics")).toEqual(["Intro", "Reading", "Quiz one"]);

    // Keyboard alternative: move down / up buttons.
    await basics.getByRole("button", { name: "Move lesson Intro down" }).click();
    await expect.poll(() => lessonTitles(page, "Basics")).toEqual(["Reading", "Intro", "Quiz one"]);
    await basics.getByRole("button", { name: "Move lesson Quiz one up" }).click();
    await expect.poll(() => lessonTitles(page, "Basics")).toEqual(["Reading", "Quiz one", "Intro"]);
    await expect(basics.getByRole("button", { name: "Move lesson Reading up" })).toBeDisabled();

    // Drag and drop: drag "Intro" onto "Reading".
    await basics.getByText("Intro", { exact: true }).dragTo(basics.getByText("Reading", { exact: true }));
    await expect.poll(() => lessonTitles(page, "Basics")).toEqual(["Intro", "Reading", "Quiz one"]);

    // Persisted: survives a reload.
    await page.reload();
    expect(await lessonTitles(page, "Basics")).toEqual(["Intro", "Reading", "Quiz one"]);

    // Section reorder with the buttons.
    await page.getByRole("button", { name: "Move section Advanced up" }).click();
    await expect.poll(async () => page.getByRole("heading", { level: 2 }).allTextContents()).toEqual(["Advanced", "Basics"]);

    // Rename a lesson.
    const basics2 = page.getByRole("region", { name: "Basics" });
    await basics2.getByRole("button", { name: "Rename lesson Reading" }).click();
    await basics2.getByLabel("Lesson title", { exact: true }).fill("Reading material");
    await basics2.getByRole("button", { name: "Save" }).click();
    await expect(basics2.getByText("Reading material")).toBeVisible();

    // Move a lesson to another section via the menu.
    await basics2.getByLabel("Move lesson Quiz one to another section").selectOption({ label: "Advanced" });
    await expect(page.getByRole("region", { name: "Advanced" }).getByText("Quiz one")).toBeVisible();
    expect(await lessonTitles(page, "Basics")).toEqual(["Intro", "Reading material"]);

    // Delete needs confirmation; "Keep" backs out.
    await basics2.getByRole("button", { name: "Delete lesson Intro" }).click();
    await expect(page.getByRole("alertdialog", { name: "Confirm deleting lesson Intro" })).toBeVisible();
    await page.getByRole("button", { name: "Keep" }).click();
    await expect(basics2.getByText("Intro", { exact: true })).toBeVisible();
    await basics2.getByRole("button", { name: "Delete lesson Intro" }).click();
    await page.getByRole("button", { name: "Delete lesson", exact: true }).click();
    await expect(basics2.getByText("Intro", { exact: true })).toHaveCount(0);

    // Delete a whole section (its lessons go with it).
    await page.getByRole("button", { name: "Delete section Advanced" }).click();
    await page.getByRole("button", { name: /^Delete section and its 1 lesson/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Advanced" })).toHaveCount(0);
    await expect(page.getByText("Quiz one")).toHaveCount(0);
  });

  test("shows validation errors and the guided step bar", async ({ page }) => {
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${course.courseId}/curriculum`);
    await page.waitForLoadState("networkidle");
    const steps = page.getByRole("navigation", { name: "Course setup steps" });
    await expect(steps.getByRole("link", { name: "Basics" })).toBeVisible();
    await expect(steps.locator('[aria-current="step"]')).toContainText("Curriculum");

    await page.getByLabel("New section title").fill("   ");
    await page.getByRole("button", { name: "Add section" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a title." })).toBeVisible();
  });

  test("another instructor gets a 404 and a locked course is read-only", async ({ page }) => {
    await signIn(page, other);
    const res = await page.goto(`/instructor/courses/${course.courseId}/curriculum`);
    expect(res?.status()).toBe(404);

    const locked = await createCourse(svc, instructor.id, {
      slug: `${tag}-lock`,
      title: `${tag} Locked Curriculum`,
      publish: false,
      sections: [{ title: "Fixed", lessons: [{ title: "Only lesson" }] }],
    });
    courseIds.push(locked.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", locked.versionId);
    await page.context().clearCookies();
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${locked.courseId}/curriculum`);
    await expect(page.getByText("This course is locked while it is in review or published")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add section" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Delete section Fixed" })).toBeDisabled();
  });

  test("the basics page links on to the curriculum", async ({ page }) => {
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${course.courseId}/basics`);
    await page.getByRole("link", { name: "Next step: Curriculum" }).click();
    await expect(page).toHaveURL(`/instructor/courses/${course.courseId}/curriculum`);
  });
});
