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

// F-216: Instructor Analytics Overview & Extended (T-107, T-108, TEST_PLAN §12)
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

    const student1 = await createUserWithRole(svc, `${tag}-s1`, "learner", {
      fullName: `${tag}-s1 Learner`,
    });
    const student2 = await createUserWithRole(svc, `${tag}-s2`, "learner", {
      fullName: `${tag}-s2 Learner`,
    });
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

    // Assessment & Questions (T-108)
    const { data: ast } = await svc
      .from("assessments")
      .insert({
        version_id: course.versionId,
        title: `${tag} Quiz 1`,
        pass_mark: 70,
      })
      .select("id")
      .single();

    await svc.from("assessment_questions").insert({
      assessment_id: ast!.id,
      type: "mcq",
      prompt: `${tag} Question: What is 2 + 2?`,
      points: 1,
    });

    await svc.from("assessment_attempts").insert({
      assessment_id: ast!.id,
      enrollment_id: e2!.id,
      user_id: student2.id,
      attempt_number: 1,
      status: "graded",
      percent: 90,
      score: 90,
      max_score: 100,
      passed: true,
      started_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

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

  test("loads metrics, KPI cards, trend chart, and applies date and course filters (T-107)", async ({
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
    // Revenue belongs to the platform, not the instructor (ADR-037).
    await expect(kpiCards.getByText("Revenue")).toHaveCount(0);

    // Check KPI values
    await expect(kpiCards.getByText("50%")).toBeVisible(); // 1 of 2 completed = 50%

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

  test("video & lesson analytics tab shows watch time, completion, and drop-off (T-108)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    // Click Video & Lessons tab
    await page.goto("/instructor/analytics?tab=lessons");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Lesson & Video Engagement")).toBeVisible();

    // Verify lesson stats table headers and content
    await expect(page.getByRole("columnheader", { name: "Lesson" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Drop-off Rate" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Avg Position / Watch" })).toBeVisible();
    await expect(page.getByText("1m").first()).toBeVisible(); // 60s watch position = 1m
  });

  test("assessments tab shows pass rates, attempts, and question difficulty (T-108)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    // Click Assessments tab
    await page.goto("/instructor/analytics?tab=assessments");
    await expect(page.getByRole("heading", { level: 1, name: "Analytics" })).toBeVisible();
    await expect(page.getByText("Assessment Performance")).toBeVisible();
    await expect(page.getByRole("cell", { name: `${tag} Quiz 1` }).first()).toBeVisible();

    // Verify question difficulty
    await expect(page.getByText("Question Difficulty & Quality")).toBeVisible();
    await expect(page.getByText(`${tag} Question: What is 2 + 2?`)).toBeVisible();
    await expect(page.getByText("easy").first()).toBeVisible();
  });

  test("csv export downloads scoped course analytics (T-108, TEST_PLAN §12)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/login");
    await page.getByLabel("Email").fill(teacher.email);
    await page.getByLabel("Password").fill(teacher.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");

    // Fetch the export endpoint with course scoping
    const response = await page.request.get(`/instructor/analytics/export?course=${course.courseId}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");

    const text = await response.text();
    expect(text).toContain("Learner Name,Course Title,Status");
    expect(text).toContain(`${tag} Deep Learning Masterclass`);
    expect(text).toContain(`${tag}-s1 Learner`);
    expect(text).toContain(`${tag}-s2 Learner`);
  });
});
