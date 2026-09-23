import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

loadEnvLocal();

// F-104. Default storageState = the shared e2e learner (auth.setup.ts).
test.describe("My Learning", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ml");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let learnerId: string;
  let progressCourse: Awaited<ReturnType<typeof createCourse>>;
  let doneCourse: Awaited<ReturnType<typeof createCourse>>;
  let savedCourse: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    learnerId = JSON.parse(readFileSync("tests/e2e/.auth/user.meta.json", "utf8")).userId;
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor");
    userIds.push(instructor.id);
    const lessons = [{ title: "L1" }, { title: "L2" }, { title: "L3" }, { title: "L4" }];
    progressCourse = await createCourse(svc, instructor.id, {
      slug: `${tag}-prog`,
      title: `${tag} in progress`,
      sections: [{ title: "S", lessons }],
    });
    doneCourse = await createCourse(svc, instructor.id, {
      slug: `${tag}-done`,
      title: `${tag} finished`,
      sections: [{ title: "S", lessons: [{ title: "Only" }] }],
    });
    savedCourse = await createCourse(svc, instructor.id, {
      slug: `${tag}-save`,
      title: `${tag} to save`,
    });
    courseIds.push(progressCourse.courseId, doneCourse.courseId, savedCourse.courseId);
  });

  test.afterAll(() => cleanup(svc, { courseIds, userIds }));

  test("shows enrolled courses with progress, split by tab, plus saving from the course page", async ({
    page,
  }) => {
    const { data: e1 } = await svc
      .from("enrollments")
      .insert({
        user_id: learnerId,
        course_id: progressCourse.courseId,
        version_id: progressCourse.versionId,
      })
      .select("id")
      .single();
    await svc.from("lesson_progress").insert(
      progressCourse.lessonIds.slice(0, 1).map((lesson_id) => ({
        enrollment_id: e1!.id,
        lesson_id,
        completed_at: new Date().toISOString(),
      })),
    );
    await svc.from("enrollments").insert({
      user_id: learnerId,
      course_id: doneCourse.courseId,
      version_id: doneCourse.versionId,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    await page.goto("/learner/my-learning");
    await expect(page.getByRole("heading", { level: 1, name: "My Learning" })).toBeVisible();
    await expect(page.getByRole("link", { name: /In progress/ })).toContainText("(");
    const card = page.getByRole("listitem").filter({ hasText: `${tag} in progress` });
    await expect(card).toContainText("1 of 4 lessons · 25%");
    await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    await expect(card.getByRole("link", { name: "Resume" })).toBeVisible();
    await expect(page.getByText(`${tag} finished`)).toHaveCount(0);

    await page.getByRole("link", { name: /Completed/ }).click();
    await expect(page.getByText(`${tag} finished`)).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ hasText: `${tag} finished` })
        .getByText("Completed", { exact: true }),
    ).toBeVisible();

    // Save from the course page, then see it under Saved.
    await page.goto(`/courses/${tag}-save`);
    // Save is a toggle (not idempotent): let hydration finish, then click exactly once.
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Save for later" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible({ timeout: 15_000 });

    await page.goto("/learner/my-learning?tab=saved");
    await expect(page.getByText(`${tag} to save`)).toBeVisible();

    // Unsave.
    await page.goto(`/courses/${tag}-save`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Saved" }).click();
    await expect(page.getByRole("button", { name: "Save for later" })).toBeVisible({
      timeout: 15_000,
    });
    await page.goto("/learner/my-learning?tab=saved");
    await expect(page.getByText(`${tag} to save`)).toHaveCount(0);
  });
});

test.describe("My Learning empty states", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  const svc = serviceClient();
  let userId: string;
  let email: string;

  test.beforeAll(async () => {
    const u = await createUserWithRole(svc, uniqueTag("mlempty"), "learner");
    userId = u.id;
    email = u.email;
  });
  test.afterAll(async () => {
    await svc.auth.admin.deleteUser(userId);
  });

  test("a new learner sees helpful empty states on every tab", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("fixture-password-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");

    await page.goto("/learner/my-learning");
    await expect(page.getByText("You are not learning anything yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Browse courses" })).toBeVisible();
    await page.getByRole("link", { name: /Completed/ }).click();
    await expect(page.getByText("No completed courses yet")).toBeVisible();
    await page.getByRole("link", { name: /Saved/ }).click();
    await expect(page.getByText("Nothing saved yet")).toBeVisible();
  });
});
