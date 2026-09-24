import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createPath, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-111: learning paths: catalog, ordered detail, follow, progress.
test.describe("learning paths", () => {
  const svc = serviceClient();
  const tag = uniqueTag("lpe");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const pathIds: string[] = [];
  let learner: { id: string; email: string; password: string };
  let c1: Awaited<ReturnType<typeof createCourse>>;
  let c2: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(ins.id);
    learnerIds.push(learner.id);
    c1 = await createCourse(svc, ins.id, { slug: `${tag}-c1`, title: `${tag} First Course`, publish: true });
    c2 = await createCourse(svc, ins.id, { slug: `${tag}-c2`, title: `${tag} Second Course`, publish: true });
    courseIds.push(c1.courseId, c2.courseId);
    const p = await createPath(svc, { slug: `${tag}-path`, title: `${tag} Path`, description: "Two steps to go", courseIds: [c1.courseId, c2.courseId] });
    const draft = await createPath(svc, { slug: `${tag}-draft`, title: `${tag} Draft Path`, status: "draft", courseIds: [c1.courseId] });
    pathIds.push(p.pathId, draft.pathId);
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds, pathIds }));

  test("browse, open a path in order, follow it, see progress advance, and stop following", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page);
    await page.goto("/learner/paths");
    await expect(page.getByRole("heading", { level: 1, name: "Learning Paths" })).toBeVisible();
    await expect(page.getByRole("link", { name: `${tag} Draft Path` })).toHaveCount(0);
    await page.getByRole("link", { name: `${tag} Path`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/learner/paths/${tag}-path$`));

    const steps = page.getByRole("list", { name: "Courses in this path" }).getByRole("listitem");
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toContainText(`${tag} First Course`);
    await expect(steps.nth(1)).toContainText(`${tag} Second Course`);
    await expect(page.getByText("0 of 2 courses completed")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Start with ${tag} First Course`) })).toBeVisible();

    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Follow this path" }).click();
    await expect(page.getByRole("button", { name: "Stop following" })).toBeVisible();
    await page.goto("/learner/paths");
    await expect(page.getByRole("heading", { name: "Your paths" })).toBeVisible();
    await expect(page.getByText("Following")).toBeVisible();

    // Completing the first course moves progress and the next step.
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: c1.courseId, version_id: c1.versionId, status: "completed", completed_at: new Date().toISOString() });
    await page.goto(`/learner/paths/${tag}-path`);
    await expect(page.getByText("1 of 2 courses completed · 50%")).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`Next up: ${tag} Second Course`) })).toBeVisible();
    await expect(steps.nth(0)).toContainText("Completed");

    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Stop following" }).click();
    await expect(page.getByRole("button", { name: "Follow this path" })).toBeVisible();
  });

  test("unknown and draft paths are 404, and a signed-out visitor is sent to log in", async ({ page }) => {
    await signIn(page);
    for (const slug of [`${tag}-draft`, "no-such-path"]) {
      const res = await page.goto(`/learner/paths/${slug}`);
      expect(res?.status()).toBe(404);
    }
    await page.context().clearCookies();
    await page.goto(`/learner/paths/${tag}-path`);
    await expect(page).toHaveURL(/\/login/);
  });
});
