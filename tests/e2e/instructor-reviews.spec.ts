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
test.use({ storageState: { cookies: [], origins: [] } });

// F-217: Instructor Reviews Management (T-109)
test.describe("instructor reviews", () => {
  const svc = serviceClient();
  const tag = uniqueTag("inrev");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];

  let teacher: { id: string; email: string; password: string };
  let teacherEmpty: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let student1: { id: string; email: string; password: string };
  let student2: { id: string; email: string; password: string };

  test.beforeAll(async () => {
    // 1. Create teachers
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor", {
      fullName: `${tag} Teacher`,
    });
    teacherEmpty = await createUserWithRole(svc, `${tag}-tchemp`, "instructor", {
      fullName: `${tag} Empty Teacher`,
    });
    userIds.push(teacher.id, teacherEmpty.id);

    // 2. Create learners
    student1 = await createUserWithRole(svc, `${tag}-s1`, "learner", {
      fullName: `${tag} Alice Learner`,
    });
    student2 = await createUserWithRole(svc, `${tag}-s2`, "learner", {
      fullName: `${tag} Bob Learner`,
    });
    learnerIds.push(student1.id, student2.id);

    // 3. Create course for teacher
    course = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Fullstack Architecture`,
      publish: true,
    });
    courseIds.push(course.courseId);

    // 4. Enroll students and mark completed
    await svc.from("enrollments").insert([
      {
        user_id: student1.id,
        course_id: course.courseId,
        version_id: course.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
      {
        user_id: student2.id,
        course_id: course.courseId,
        version_id: course.versionId,
        status: "completed",
        completed_at: new Date().toISOString(),
      },
    ]);

    // 5. Insert reviews
    await svc.from("course_ratings").insert([
      {
        course_id: course.courseId,
        user_id: student1.id,
        rating: 5,
        body: `${tag} Masterclass on fullstack architecture! Extremely well explained.`,
      },
      {
        course_id: course.courseId,
        user_id: student2.id,
        rating: 4,
        body: `${tag} Great explanations and clean practical code examples.`,
      },
    ]);
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("empty state for teacher with no courses", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacherEmpty.email);
    await page.getByLabel("Password").fill(teacherEmpty.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible();
    await expect(page.getByText("No courses yet")).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Create Course" })).toBeVisible();
  });

  test("displays rating distribution, reviews list, filters, and supports reply lifecycle (T-109)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/reviews");
    await expect(page.getByRole("heading", { level: 1, name: "Reviews" })).toBeVisible();

    // 1. Verify Distribution Card
    await expect(page.getByText("4.5")).toBeVisible();
    await expect(page.getByText("Based on 2 reviews")).toBeVisible();
    await expect(page.getByText("2 Unreplied")).toBeVisible();

    // 2. Verify Reviews list
    await expect(page.getByText(`${tag} Alice Learner`)).toBeVisible();
    await expect(page.getByText(`${tag} Bob Learner`)).toBeVisible();
    await expect(
      page.getByText(`${tag} Masterclass on fullstack architecture! Extremely well explained.`),
    ).toBeVisible();

    // 3. Filter by rating: click 5 star pill
    const fiveStarPill = page.getByRole("button", { name: "5" });
    await fiveStarPill.click();
    await expect(page).toHaveURL(/rating=5/);
    await expect(page.getByText(`${tag} Alice Learner`)).toBeVisible();
    await expect(page.getByText(`${tag} Bob Learner`)).not.toBeVisible();

    // Reset rating filter
    const allRatingPill = page.getByRole("button", { name: "All", exact: true });
    await allRatingPill.click();
    await expect(page.getByText(`${tag} Bob Learner`)).toBeVisible();

    // 4. Reply to review
    page.on("dialog", (dialog) => dialog.accept());

    const aliceReviewCard = page.locator("article").filter({ hasText: `${tag} Alice Learner` });
    await expect(aliceReviewCard).toBeVisible();

    const replyButton = aliceReviewCard.getByRole("button", { name: "Reply to review" });
    await replyButton.click();

    const textarea = aliceReviewCard.getByPlaceholder("Thank the learner for their feedback...");
    await expect(textarea).toBeVisible();
    await textarea.fill("Thank you so much Alice, delighted to hear this!");

    const submitReplyBtn = aliceReviewCard.getByRole("button", { name: "Post reply" });
    await submitReplyBtn.click();

    // Verify reply appears
    await expect(aliceReviewCard.getByText("Your Reply")).toBeVisible();
    await expect(
      aliceReviewCard.getByText("Thank you so much Alice, delighted to hear this!"),
    ).toBeVisible();
    await expect(aliceReviewCard.getByText("Replied", { exact: true })).toBeVisible();

    // 5. Edit reply
    const editBtn = aliceReviewCard.getByRole("button", { name: "Edit reply" });
    await editBtn.click();

    const editTextarea = aliceReviewCard.locator("textarea");
    await expect(editTextarea).toBeVisible();
    await editTextarea.fill("Updated: Truly appreciate the recommendation, Alice!");

    const saveChangesBtn = aliceReviewCard.getByRole("button", { name: "Save changes" });
    await saveChangesBtn.click();

    await expect(
      aliceReviewCard.getByText("Updated: Truly appreciate the recommendation, Alice!"),
    ).toBeVisible();

    // 6. Delete reply
    const deleteBtn = aliceReviewCard.getByRole("button", { name: "Delete reply" });
    await deleteBtn.click();

    // Verify reply was deleted and "Reply to review" button reappears
    await expect(aliceReviewCard.getByText("Your Reply")).not.toBeVisible();
    await expect(aliceReviewCard.getByRole("button", { name: "Reply to review" })).toBeVisible();
    await expect(aliceReviewCard.getByText("Needs Reply")).toBeVisible();
  });
});
