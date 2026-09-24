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
// Dedicated instructor per worker; the default storage state is a learner.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("instructor overview and My Courses (F-200, F-201)", () => {
  const svc = serviceClient();
  const tag = uniqueTag("io");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  let instructor: { id: string; email: string; password: string };

  async function signIn(page: import("@playwright/test").Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    const learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerIds.push(learner.id);

    const pub = await createCourse(svc, instructor.id, { slug: `${tag}-pub`, title: `${tag} Published Course`, ratingAvg: 4, ratingCount: 2 });
    const draft = await createCourse(svc, instructor.id, { slug: `${tag}-draft`, title: `${tag} Draft Course`, publish: false });
    const changes = await createCourse(svc, instructor.id, { slug: `${tag}-chg`, title: `${tag} Changes Course`, publish: false });
    const review = await createCourse(svc, instructor.id, { slug: `${tag}-rev`, title: `${tag} Review Course`, publish: false });
    const foreign = await createCourse(svc, other.id, { slug: `${tag}-foreign`, title: `${tag} Someone Else Course` });
    courseIds.push(pub.courseId, draft.courseId, changes.courseId, review.courseId, foreign.courseId);
    await svc.from("course_versions").update({ status: "changes_requested" }).eq("id", changes.versionId);
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", review.versionId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: pub.courseId, version_id: pub.versionId });
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("the overview shows own KPIs and pending items from real data", async ({ page }) => {
    await signIn(page, instructor);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

    const kpis = page.getByRole("region", { name: "Key numbers" });
    await expect(kpis).toContainText("4");
    await expect(kpis.getByText("Courses", { exact: true })).toBeVisible();
    await expect(kpis.getByText("Learners", { exact: true })).toBeVisible();
    await expect(kpis).toContainText("4.0");

    await expect(page.getByRole("link", { name: `${tag} Changes Course` })).toBeVisible();
    await expect(page.getByRole("link", { name: `${tag} Review Course` })).toBeVisible();
    await expect(page.getByText(`${tag} Someone Else Course`)).toHaveCount(0);
  });

  test("My Courses filters by status, searches, and only returns own courses", async ({ page }) => {
    await signIn(page, instructor);
    await page.goto("/instructor/courses");
    await expect(page.getByRole("heading", { level: 1, name: "My Courses" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^All/ })).toContainText("(4)");
    await expect(page.getByText(`${tag} Someone Else Course`)).toHaveCount(0);

    for (const [tab, title] of [
      ["Drafts", "Draft Course"],
      ["In review", "Review Course"],
      ["Needs changes", "Changes Course"],
      ["Published", "Published Course"],
    ] as const) {
      await page.getByRole("navigation", { name: "Course status" }).getByRole("link", { name: new RegExp(`^${tab}`) }).click();
      await expect(page.getByRole("heading", { level: 2, name: `${tag} ${title}` })).toBeVisible();
      await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);
    }

    await page.goto("/instructor/courses");
    await page.getByLabel("Search your courses").fill("draft");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("heading", { level: 2, name: `${tag} Draft Course` })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(1);

    await page.getByLabel("Search your courses").fill("zzzz-no-match");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByText("No courses match")).toBeVisible();
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL("/instructor/courses");
  });

  test("a new instructor sees a guided empty state", async ({ page }) => {
    const fresh = await createUserWithRole(svc, `${tag}-new`, "instructor");
    userIds.push(fresh.id);
    await signIn(page, fresh);
    await expect(page.getByText("Welcome, instructor")).toBeVisible();
    await page.goto("/instructor/courses");
    await expect(page.getByText("You have not created a course yet")).toBeVisible();
    await expect(page.getByRole("link", { name: "Create your first course" })).toBeVisible();
  });

  test("learners cannot open the instructor portal", async ({ page }) => {
    const learner = await createUserWithRole(svc, `${tag}-l2`, "learner");
    learnerIds.push(learner.id);
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
    await page.goto("/instructor/courses");
    await expect(page).toHaveURL("/permission-denied");
  });
});
