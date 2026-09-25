import { expect, test } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-213: open one student from the list, see lesson progress, message them.
test.describe("instructor student detail", () => {
  const svc = serviceClient();
  const tag = uniqueTag("isd");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let teacher: { id: string; email: string; password: string };
  let enrollmentId = "";
  let learnerId = "";

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor");
    userIds.push(teacher.id);
    const c = await createCourse(svc, teacher.id, {
      slug: `${tag}-c`, title: `${tag} Course`, publish: true,
      sections: [{ title: "S", lessons: [{ title: "First" }, { title: "Second" }] }],
    });
    courseIds.push(c.courseId);
    const l = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerId = l.id;
    learnerIds.push(l.id);
    await svc.from("profiles").update({ full_name: `${tag} Sam` }).eq("id", l.id);
    const { data: e } = await svc.from("enrollments").insert({ user_id: l.id, course_id: c.courseId, version_id: c.versionId }).select("id").single();
    enrollmentId = e!.id;
    await svc.from("lesson_progress").insert({ enrollment_id: enrollmentId, lesson_id: c.lessonIds[0], completed_at: new Date().toISOString(), last_position_seconds: 0 });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("opens a student, shows progress and delivers a message", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/students");
    await page.getByRole("link", { name: `${tag} Sam` }).click();
    await expect(page).toHaveURL(new RegExp(`/instructor/students/${enrollmentId}`));
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Sam` })).toBeVisible();
    await expect(page.getByText("1/2 lessons · 50%")).toBeVisible();
    await expect(page.getByText("No assessment attempts yet.")).toBeVisible();
    await expect(page.getByText("No submissions yet.")).toBeVisible();

    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Write a message first.")).toBeVisible();
    await page.getByLabel("Message", { exact: true }).fill("Nice progress, keep going!");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Message sent.")).toBeVisible();

    const { data } = await svc.from("notifications").select("body").eq("user_id", learnerId);
    expect(data?.some((n) => n.body === "Nice progress, keep going!")).toBe(true);
  });

  test("an unknown student is a 404", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
    const res = await page.goto("/instructor/students/00000000-0000-4000-8000-000000000000");
    expect(res?.status()).toBe(404);
  });
});
