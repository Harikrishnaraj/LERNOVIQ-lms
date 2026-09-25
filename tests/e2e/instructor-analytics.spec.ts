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

// F-216: Instructor Analytics Overview (T-107, TEST_PLAN §12)
test.describe("instructor analytics", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ina");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let teacher: { id: string; email: string; password: string };
  let teacherEmpty: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  test.beforeAll(async () => {
    teacher = await createUserWithRole(svc, `${tag}-tch`, "instructor");
    teacherEmpty = await createUserWithRole(svc, `${tag}-tchemp`, "instructor");
    userIds.push(teacher.id, teacherEmpty.id);

    await svc.from("profiles").update({ full_name: `${tag} Teacher` }).eq("id", teacher.id);
    await svc.from("profiles").update({ full_name: `${tag} New Teacher` }).eq("id", teacherEmpty.id);

    course = await createCourse(svc, teacher.id, {
      slug: `${tag}-course`,
      title: `${tag} Deep Learning Masterclass`,
      publish: true,
    });
    courseIds.push(course.courseId);

    // Set course price
    await svc
      .from("course_versions")
      .update({ price_cents: 3500 })
      .eq("id", course.versionId);

    const student1 = await createUserWithRole(svc, `${tag}-s1`, "learner");
    const student2 = await createUserWithRole(svc, `${tag}-s2`, "learner");
    learnerIds.push(student1.id, student2.id);

    // Student 1 completed
    await svc.from("enrollments").insert({
      user_id: student1.id,
      course_id: course.courseId,
      version_id: course.versionId,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    // Student 2 active
    const { data: e2 } = await svc
      .from("enrollments")
      .insert({
        user_id: student2.id,
        course_id: course.courseId,
        version_id: course.versionId,
        status: "active",
      })
      .select("id")
      .single();

    // Progress record
    await svc.from("lesson_progress").insert({
      enrollment_id: e2!.id,
      lesson_id: course.lessonIds[0],
      completed_at: null,
      last_position_seconds: 60,
      updated_at: new Date().toISOString(),
    });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("empty analytics state for teacher with no courses", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacherEmpty.email);
    await page.getByLabel("Password").fill(teacherEmpty.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    await expect(page.getByText("No courses yet")).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Create Course" })).toBeVisible();
  });

  test("loads metrics, KPI cards, trend chart, and applies date and course filters", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    await page.goto("/instructor/analytics");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();

    // Verify KPI cards
    const kpiCards = page.getByLabel("Key performance indicators");
    await expect(kpiCards.getByText("Enrollments")).toBeVisible();
    await expect(kpiCards.getByText("Completion Rate")).toBeVisible();
    await expect(kpiCards.getByText("Active Learners")).toBeVisible();
    await expect(kpiCards.getByText("Revenue")).toBeVisible();

    // Check KPI values
    await expect(kpiCards.getByText("50%")).toBeVisible(); // 1 of 2 completed = 50%
    await expect(kpiCards.getByText("$70")).toBeVisible(); // 2 * $35 = $70

    // Check Trend chart and Breakdown table
    await expect(page.getByText("Daily Engagement & Enrollments")).toBeVisible();
    await expect(page.getByText("Course Breakdown")).toBeVisible();
    await expect(page.getByRole("link", { name: `${tag} Deep Learning Masterclass` })).toBeVisible();

    // Date range filter: switch to 7d
    const range7d = page.getByRole("button", { name: "7d" });
    await range7d.click();
    await expect(page).toHaveURL(/range=7/);
    await expect(page.getByText("In the last 7 days")).toBeVisible();

    // Course filter: select specific course
    const courseSelect = page.getByRole("combobox", { name: "Filter by course" });
    await courseSelect.selectOption(course.courseId);
    await expect(page).toHaveURL(new RegExp(`course=${course.courseId}`));
    await expect(
      page.getByText(`Performance for "${tag} Deep Learning Masterclass"`),
    ).toBeVisible();
  });
});
