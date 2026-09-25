import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-117: reviews on the public course page: completed learners write, everyone reads.
test.describe("course reviews", () => {
  const svc = serviceClient();
  const tag = uniqueTag("rve");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let finisher: { id: string; email: string; password: string };
  let learning: { id: string; email: string; password: string };
  let c: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  test.beforeAll(async () => {
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    finisher = await createUserWithRole(svc, `${tag}-fin`, "learner");
    learning = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    userIds.push(ins.id);
    learnerIds.push(finisher.id, learning.id);
    await svc.from("profiles").update({ full_name: "Finn Finisher" }).eq("id", finisher.id);
    c = await createCourse(svc, ins.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    courseIds.push(c.courseId);
    await svc.from("enrollments").insert([
      { user_id: finisher.id, course_id: c.courseId, version_id: c.versionId, status: "completed", completed_at: new Date().toISOString() },
      { user_id: learning.id, course_id: c.courseId, version_id: c.versionId, status: "active" },
    ]);
  });

  test.afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }));

  test("a signed-out visitor reads reviews but is told how to review", async ({ page }) => {
    await page.goto(`/courses/${tag}-c`);
    const section = page.getByRole("region", { name: "Reviews" });
    await expect(section.getByText("No reviews yet.")).toBeVisible();
    await expect(section.getByText("Log in and complete this course to leave a review.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Write a review" })).toHaveCount(0);
  });

  test("a learner still learning cannot review", async ({ page }) => {
    await signIn(page, learning);
    await page.goto(`/courses/${tag}-c`);
    await expect(page.getByText("You can review this course once you have completed it.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Write a review" })).toHaveCount(0);
  });

  test("a learner who completed the course posts, edits and deletes a review; the summary follows", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page, finisher);
    await page.goto(`/courses/${tag}-c`);
    await page.waitForLoadState("networkidle");
    const form = page.getByRole("form", { name: "Write a review" });

    // A rating is required.
    await form.getByRole("button", { name: "Post review" }).click();
    await expect(form.getByText("Choose a rating from 1 to 5 stars.")).toBeVisible();

    await form.getByRole("radio", { name: "4 stars" }).check({ force: true });
    await form.getByLabel("Your review (optional)").fill("Clear and practical.");
    await form.getByRole("button", { name: "Post review" }).click();
    await expect(form.getByText("Thanks, your review is saved.")).toBeVisible();

    const section = page.getByRole("region", { name: "Reviews" });
    const list = section.getByRole("list", { name: "Reviews" });
    await expect(list.getByText("Clear and practical.")).toBeVisible();
    await expect(list.getByText("Finn Finisher")).toBeVisible();
    await expect(list.getByRole("img", { name: "4 out of 5 stars" })).toBeVisible();
    await expect(section.getByText("1 review", { exact: true })).toBeVisible();
    await expect(section.getByText("4.0")).toBeVisible();

    // Edit: it replaces, not duplicates.
    await page.waitForLoadState("networkidle");
    await form.getByRole("radio", { name: "5 stars" }).check({ force: true });
    await form.getByLabel("Your review (optional)").fill("Even better on a second look.");
    await form.getByRole("button", { name: "Update review" }).click();
    await expect(list.getByText("Even better on a second look.")).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(1);
    await expect(section.getByText("5.0")).toBeVisible();

    // Anyone can now see it, signed out.
    const anonCtx = await page.context().browser()!.newContext();
    const ap = await anonCtx.newPage();
    await ap.goto(`/courses/${tag}-c`);
    await expect(ap.getByRole("list", { name: "Reviews" }).getByText("Even better on a second look.")).toBeVisible();
    await anonCtx.close();

    // Delete it.
    await page.waitForLoadState("networkidle");
    await form.getByRole("button", { name: "Delete my review" }).click();
    await expect(section.getByText("No reviews yet.")).toBeVisible();
  });
});
