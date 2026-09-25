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

// F-215: Messaging: 1:1 threads with learners, unread counts.
test.describe("instructor messaging", () => {
  const svc = serviceClient();
  const tag = uniqueTag("msg");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let teacher: { id: string; email: string; password: string };
  let student: { id: string; email: string; password: string };
  let threadId = "";

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor");
    student = await createUserWithRole(svc, `${tag}-std`, "learner");
    userIds.push(teacher.id);
    learnerIds.push(student.id);

    await svc.from("profiles").update({ full_name: `${tag} Teacher` }).eq("id", teacher.id);
    await svc.from("profiles").update({ full_name: `${tag} Student` }).eq("id", student.id);

    const c = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Masterclass`,
      publish: true,
    });
    courseIds.push(c.courseId);

    await svc.from("enrollments").insert({
      user_id: student.id,
      course_id: c.courseId,
      version_id: c.versionId,
    });

    // Create 1:1 thread
    const { data: th } = await svc
      .from("message_threads")
      .insert({
        course_id: c.courseId,
        instructor_id: teacher.id,
        learner_id: student.id,
      })
      .select("id")
      .single();
    threadId = th!.id;

    // Student sends a message to the teacher (unread)
    await svc.from("direct_messages").insert({
      thread_id: threadId,
      sender_id: student.id,
      body: "Hello Professor, I have a question about the assignment.",
    });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("instructor sees unread badge, views thread, replies, and sends message", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    // Navigate to messages
    await page.goto("/instructor/messages");
    await expect(page.getByRole("heading", { level: 1, name: "Messages" })).toBeVisible();

    // Verify unread badge in header or thread list
    await expect(page.getByText("1 unread message")).toBeVisible();
    await expect(page.getByRole("heading", { name: `${tag} Student` })).toBeVisible();
    await expect(page.getByText("Hello Professor, I have a question about the assignment.").first()).toBeVisible();

    // Send a reply
    const sendForm = page.getByRole("form", { name: "Send message" });
    await sendForm.getByPlaceholder(`Message ${tag} Student...`).fill("Welcome to class! What question do you have?");
    await sendForm.getByRole("button", { name: "Send" }).click();

    // Verify message appears in conversation
    await expect(page.getByText("Welcome to class! What question do you have?").first()).toBeVisible();
  });
});
