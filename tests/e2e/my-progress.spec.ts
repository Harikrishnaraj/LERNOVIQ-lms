import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

// F-114: hours, streak, completion and skills from real completions.
test.describe("my progress", () => {
  const svc = serviceClient();
  const tag = uniqueTag("mpe");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let learner: { id: string; email: string; password: string };

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(ins.id);
    learnerIds.push(learner.id);
    const { data: cat } = await svc.from("categories").select("id, name").limit(1).single();
    const c = await createCourse(svc, ins.id, {
      slug: `${tag}-c`, title: `${tag} Course`, publish: true, categoryId: cat!.id as string,
      sections: [{ title: "S", lessons: [{ title: "L1", minutes: 30 }, { title: "L2", minutes: 30 }, { title: "L3", minutes: 30 }, { title: "L4", minutes: 30 }] }],
    });
    courseIds.push(c.courseId);
    const { data: e } = await svc.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId }).select("id").single();
    await svc.from("lesson_progress").insert([
      { enrollment_id: e!.id, lesson_id: c.lessonIds[0], completed_at: daysAgo(0), last_position_seconds: 0 },
      { enrollment_id: e!.id, lesson_id: c.lessonIds[1], completed_at: daysAgo(1), last_position_seconds: 0 },
      { enrollment_id: e!.id, lesson_id: c.lessonIds[2], completed_at: daysAgo(2), last_position_seconds: 0 },
    ]);
    // Keep the category name for the skills assertion.
    (learner as { cat?: string }).cat = cat!.name as string;
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("shows hours, a three-day streak, per-course completion and a skill", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, learner);
    await page.goto("/learner/progress");
    await expect(page.getByRole("heading", { level: 1, name: "My Progress" })).toBeVisible();

    const kpis = page.getByRole("region", { name: "Key numbers" });
    await expect(kpis.getByText("1.5 h")).toBeVisible();
    await expect(kpis.getByText("3 days")).toBeVisible();
    await expect(kpis.getByText("Lessons completed")).toBeVisible();
    await expect(kpis.getByText("0 of 1")).toBeVisible();

    await expect(page.getByRole("list", { name: "Activity, last 28 days" }).getByText(/: active/)).toHaveCount(3);
    await expect(page.getByText("3/4 lessons · 75%")).toBeVisible();
    await expect(page.getByRole("progressbar", { name: `Progress in ${tag} Course` })).toBeVisible();
    await expect(page.getByText((learner as { cat?: string }).cat!, { exact: true })).toBeVisible();
    await expect(page.getByText("Beginner", { exact: true })).toBeVisible();
  });

  test("a learner with no enrollments sees the empty state", async ({ page }) => {
    const fresh = await createUserWithRole(svc, `${tag}-new`, "learner");
    learnerIds.push(fresh.id);
    await signIn(page, fresh);
    await page.goto("/learner/progress");
    await expect(page.getByText("Nothing to track yet")).toBeVisible();
    await page.getByRole("link", { name: "Browse courses" }).click();
    await expect(page).toHaveURL(/\/courses/);
  });
});
