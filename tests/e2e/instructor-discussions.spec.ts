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

// F-214: Instructor discussions: unanswered queue, reply, pin, moderate.
test.describe("instructor discussions", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ids");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let teacher: { id: string; email: string; password: string };
  let asker: { id: string; email: string; password: string };
  let classmate: { id: string; email: string; password: string };
  let discussionId = "";
  let replyPostId = "";

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor");
    asker = await createUserWithRole(svc, `${tag}-ask`, "learner");
    classmate = await createUserWithRole(svc, `${tag}-cls`, "learner");
    userIds.push(teacher.id);
    learnerIds.push(asker.id, classmate.id);

    await svc.from("profiles").update({ full_name: `${tag} Teacher` }).eq("id", teacher.id);
    await svc.from("profiles").update({ full_name: `${tag} Asker` }).eq("id", asker.id);
    await svc.from("profiles").update({ full_name: `${tag} Classmate` }).eq("id", classmate.id);

    const c = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Advanced Course`,
      publish: true,
    });
    courseIds.push(c.courseId);

    await svc.from("enrollments").insert([
      { user_id: asker.id, course_id: c.courseId, version_id: c.versionId },
      { user_id: classmate.id, course_id: c.courseId, version_id: c.versionId },
    ]);

    // Asker posts a discussion
    const { data: thread } = await svc
      .from("discussions")
      .insert({
        course_id: c.courseId,
        author_id: asker.id,
        title: "How to solve project step 3?",
        body: "I am stuck on the third step of the final module.",
      })
      .select("id")
      .single();
    discussionId = thread!.id;

    // Classmate posts a reply
    const { data: post } = await svc
      .from("discussion_posts")
      .insert({
        discussion_id: discussionId,
        author_id: classmate.id,
        body: "Try resetting your terminal and re-running the build.",
      })
      .select("id")
      .single();
    replyPostId = post!.id;

    // Asker reports classmate's reply
    await svc.from("discussion_reports").insert({
      reporter_id: asker.id,
      target_type: "post",
      target_id: replyPostId,
      reason: "Not helpful / misleading advice",
    });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("instructor views queue, pins, replies, marks answer, moderates and resolves report", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    // Navigate to discussions
    await page.goto("/instructor/discussions");
    await expect(page.getByRole("heading", { level: 1, name: "Discussions" })).toBeVisible();
    await expect(page.getByText("How to solve project step 3?")).toBeVisible();
    await expect(page.getByText("Unanswered", { exact: true }).first()).toBeVisible();

    // Pin discussion directly from the queue
    const queueItem = page.getByRole("listitem").filter({ hasText: "How to solve project step 3?" });
    await queueItem.getByRole("button", { name: /Pin discussion/ }).click();
    await expect(queueItem.getByRole("button", { name: /Unpin discussion/ })).toBeVisible();

    // Open the discussion thread
    await page.getByRole("link", { name: "How to solve project step 3?" }).click();
    await page.waitForURL(new RegExp(`/instructor/discussions/${discussionId}`));
    await expect(page.getByRole("heading", { level: 1, name: "How to solve project step 3?" })).toBeVisible();
    await expect(page.getByText("Try resetting your terminal and re-running the build.")).toBeVisible();

    // Check that open report is visible to instructor
    await expect(page.getByText("Reported content:")).toBeVisible();
    await expect(page.getByText("Not helpful / misleading advice")).toBeVisible();

    // Post instructor reply
    const replyForm = page.getByRole("form", { name: "Instructor reply" });
    await replyForm
      .getByPlaceholder("Write your answer or instructions for the learner...")
      .fill("Review lesson 3 notes, specifically section B.");
    await replyForm.getByRole("button", { name: "Post Instructor Reply" }).click();

    // Verify instructor reply rendered with Instructor badge
    const repliesList = page.getByRole("list", { name: "Replies" });
    await expect(repliesList.getByText("Review lesson 3 notes, specifically section B.")).toBeVisible();
    await expect(repliesList.getByText("Instructor").first()).toBeVisible();

    // Mark instructor reply as accepted answer
    const instructorPost = repliesList.getByRole("listitem").filter({ hasText: "Review lesson 3 notes" });
    await instructorPost.getByRole("button", { name: "Mark as answer" }).click();
    await expect(instructorPost.getByText("Accepted Answer")).toBeVisible();

    // Resolve reports on the classmate's post
    const reportedPost = repliesList.getByRole("listitem").filter({ hasText: "Try resetting your terminal" });
    await reportedPost.getByRole("button", { name: "Resolve reports" }).click();
    await expect(reportedPost.getByText("Reports resolved")).toBeVisible();

    // Return to discussions queue - it should now be in the Answered tab
    await page.goto("/instructor/discussions?filter=answered");
    await expect(page.getByText("How to solve project step 3?")).toBeVisible();
    await expect(page.getByText("Answered").first()).toBeVisible();
  });
});
