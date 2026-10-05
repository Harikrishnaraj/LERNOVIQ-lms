import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-201: the course overview shows status, stats and quick links; only the owner can open it.
test.describe("course overview", () => {
  const svc = serviceClient();
  const tag = uniqueTag("co");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("shows status, stats, checklist hint and links to every builder step", async ({ page }) => {
    test.setTimeout(120_000);
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-a`,
      title: `${tag} Overview`,
      publish: false,
      priceCents: 2500,
      sections: [{ title: "S1", lessons: [{ title: "L1" }, { title: "L2" }] }],
    });
    courseIds.push(c.courseId);
    await createAssessment(svc, c.versionId, { title: "Quiz", questions: [] });
    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerIds.push(learner.id);

    await signIn(page, instructor);
    await page.goto("/instructor/courses");
    await page.getByRole("link", { name: `${tag} Overview` }).first().click();
    await expect(page).toHaveURL(new RegExp(`/instructor/courses/${c.courseId}$`));

    await expect(page.getByRole("heading", { level: 1, name: `${tag} Overview` })).toBeVisible();
    const stats = page.getByRole("group", { name: "Course statistics" }).or(page.getByLabel("Course statistics"));
    await expect(stats.getByText("1 / 2")).toBeVisible();
    await expect(stats.getByText("$25.00")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /items? to finish/ })).toBeVisible();

    // Scoped to the builder steps: the portal sidebar also has a "Settings" link (hidden on phones).
    const steps = page.getByRole("region", { name: "Build your course" });
    for (const name of ["Basics", "Curriculum", "Settings", "Preview", "Readiness", "Submit", "Assessments"]) {
      await expect(steps.getByRole("link", { name: new RegExp(`^${name}`) }).first()).toBeVisible();
    }
    await page.getByRole("link", { name: /^Curriculum/ }).click();
    await expect(page).toHaveURL(/\/curriculum$/);
  });

  test("a submitted course is read-only and another instructor gets a 404", async ({ page }) => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-b`, title: `${tag} Locked`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${c.courseId}`);
    await expect(page.getByText(/is submitted, so it is read-only/)).toBeVisible();

    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await page.context().clearCookies();
    await signIn(page, other);
    const res = await page.goto(`/instructor/courses/${c.courseId}`);
    expect(res?.status()).toBe(404);
  });
});
