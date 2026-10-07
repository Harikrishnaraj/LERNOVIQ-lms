import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { loginAsRole } from "./support/role-user";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-202: the instructor's course settings step, the platform-set price (admin, ADR-037), and what
// they do for learners.
test.describe("course settings and platform price", () => {
  const svc = serviceClient();
  const tag = uniqueTag("pe");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let learner: { id: string; email: string; password: string };
  let draft: Awaited<ReturnType<typeof createCourse>>;
  let prereq: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page, u: { email: string; password: string }, landing: string) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(landing);
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(instructor.id);
    learnerIds.push(learner.id);
    draft = await createCourse(svc, instructor.id, { slug: `${tag}-main`, title: `${tag} Main Course`, publish: false });
    prereq = await createCourse(svc, instructor.id, { slug: `${tag}-req`, title: `${tag} Required First`, publish: true });
    courseIds.push(draft.courseId, prereq.courseId);
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("the instructor sets certificate, visibility and prerequisites; the price is read-only", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${draft.courseId}/pricing`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Main Course` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Price" })).toBeVisible();
    await expect(page.getByText("Course prices are set by the platform team, not by instructors.")).toBeVisible();
    await expect(page.getByLabel("Paid")).toHaveCount(0);
    await expect(page.getByPlaceholder("49.99")).toHaveCount(0);
    await expect(page.getByLabel(/Issue a certificate/)).toBeChecked();

    await page.getByLabel(/Issue a certificate/).uncheck();
    await page.getByLabel("Who can find this course").selectOption("unlisted");
    await page.getByLabel(`${tag} Required First`).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/Issue a certificate/)).not.toBeChecked();
    await expect(page.getByLabel("Who can find this course")).toHaveValue("unlisted");
    await expect(page.getByLabel(`${tag} Required First`)).toBeChecked();
  });

  test("an admin sets the price with validation; the instructor and catalog show it", async ({ page, browser }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/courses/${prereq.courseId}`);
      await page.waitForLoadState("networkidle");
      const form = page.getByRole("form", { name: "Course price" });
      await form.getByLabel("Paid").check();
      await form.getByLabel("Price").fill("0.50");
      await form.getByRole("button", { name: "Save price" }).click();
      await expect(form.getByText("The minimum price is 1.00. Choose Free for no charge.")).toBeVisible();

      await form.getByLabel("Price").fill("49.99");
      await form.getByLabel("Currency").selectOption("EUR");
      await form.getByRole("button", { name: "Save price" }).click();
      await expect(form.getByRole("status").filter({ hasText: "Price saved." })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("form", { name: "Course price" }).getByLabel("Price")).toHaveValue("49.99");
    } finally {
      await done();
    }

    // The public course page and the instructor's own view show the platform's price.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const ap = await anon.newPage();
    await ap.goto(`/courses/${tag}-req`);
    await expect(ap.getByText("€49.99").first()).toBeVisible();
    await anon.close();

    await svc.from("course_versions").update({ price_cents: 0, currency: "USD" }).eq("course_id", prereq.courseId);
  });

  test("prerequisites block enrollment in the UI until completed", async ({ page }) => {
    test.setTimeout(120_000);
    const gated = await createCourse(svc, instructor.id, { slug: `${tag}-gated`, title: `${tag} Gated Course`, publish: true });
    courseIds.push(gated.courseId);
    await svc.from("course_prerequisites").insert({ version_id: gated.versionId, prerequisite_course_id: prereq.courseId });

    await signIn(page, learner, "/learner");
    await page.goto(`/courses/${tag}-gated`);
    await expect(page.getByRole("heading", { name: "Prerequisite courses" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: `${tag} Required First` })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Enroll for free" }).click();
    await expect(page.getByRole("alert").filter({ hasText: `Complete these courses first: ${tag} Required First.` })).toBeVisible();

    // Complete the prerequisite, then enrolling works.
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: prereq.courseId, version_id: prereq.versionId, status: "completed", completed_at: new Date().toISOString() });
    await page.getByRole("button", { name: "Enroll for free" }).click();
    await expect(page.getByText("You are enrolled in this course.")).toBeVisible();
  });

  test("another instructor gets a 404 and a locked course is read-only", async ({ page }) => {
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other, "/instructor");
    const res = await page.goto(`/instructor/courses/${draft.courseId}/pricing`);
    expect(res?.status()).toBe(404);

    const locked = await createCourse(svc, instructor.id, { slug: `${tag}-lock`, title: `${tag} Locked`, publish: false });
    courseIds.push(locked.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", locked.versionId);
    await page.context().clearCookies();
    await signIn(page, instructor, "/instructor");
    await page.goto(`/instructor/courses/${locked.courseId}/pricing`);
    await expect(page.getByText("This course is locked while it is in review or published")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });
});
