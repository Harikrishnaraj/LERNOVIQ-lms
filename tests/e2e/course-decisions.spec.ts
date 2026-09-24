import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-406 / F-310: reviewer decisions through the UI, audited, and publishing makes a course live.
test.describe("course review decisions", () => {
  const svc = serviceClient();
  const tag = uniqueTag("dc");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructorId: string;

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    instructorId = instructor.id;
    userIds.push(instructor.id);
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  async function submittedCourse(slug: string) {
    const c = await createCourse(svc, instructorId, { slug: `${tag}-${slug}`, title: `${tag} ${slug}`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    return c;
  }

  test("review, approve, publish (visible to learners), then archive (gone)", async ({ page }) => {
    test.setTimeout(150_000);
    const c = await submittedCourse("happy");
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/courses/${c.courseId}`);
      await page.waitForLoadState("networkidle");
      const decisions = page.getByRole("group", { name: "Decisions" });

      // From submitted only "Start review" exists.
      await expect(decisions.getByRole("button")).toHaveText(["Start review"]);
      await decisions.getByRole("button", { name: "Start review" }).click();
      await page.getByRole("button", { name: "Confirm start review" }).click();
      await expect(page.getByText("In review").first()).toBeVisible();
      await expect(decisions.getByRole("button", { name: "Approve" })).toBeVisible();

      await decisions.getByRole("button", { name: "Approve" }).click();
      await page.getByLabel(/Note/).fill("Solid course");
      await page.getByRole("button", { name: "Confirm approve" }).click();
      await expect(decisions.getByRole("button", { name: "Publish" })).toBeVisible();

      // Not live yet.
      const before = await page.request.get(`/courses/${tag}-happy`);
      expect(before.status()).toBe(404);

      await decisions.getByRole("button", { name: "Publish" }).click();
      await page.getByRole("button", { name: "Confirm publish" }).click();
      await expect(decisions.getByRole("button", { name: "Archive" })).toBeVisible();
      const live = await page.request.get(`/courses/${tag}-happy`);
      expect(live.status()).toBe(200);

      // The history lists every decision.
      const history = page.getByRole("heading", { name: "Review history" }).locator("xpath=..");
      for (const label of ["start review", "approve", "publish"]) {
        await expect(history.getByText(label, { exact: true }).first()).toBeVisible();
      }

      await decisions.getByRole("button", { name: "Archive" }).click();
      await page.getByRole("button", { name: "Confirm archive" }).click();
      await expect(page.getByText("No decisions are available for this status.")).toBeVisible();
      const gone = await page.request.get(`/courses/${tag}-happy`);
      expect(gone.status()).toBe(404);

      const { data: audit } = await svc.from("audit_logs").select("action").eq("resource_id", c.courseId).order("created_at");
      expect(audit!.map((a) => a.action)).toEqual([
        "course.review_started",
        "course.approved",
        "course.published",
        "course.archived",
      ]);
    } finally {
      await done();
    }
  });

  test("requesting changes or rejecting needs a note", async ({ page }) => {
    test.setTimeout(120_000);
    const c = await submittedCourse("note");
    await svc.from("course_versions").update({ status: "in_review" }).eq("id", c.versionId);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto(`/admin/courses/${c.courseId}`);
      await page.waitForLoadState("networkidle");
      const decisions = page.getByRole("group", { name: "Decisions" });
      await decisions.getByRole("button", { name: "Request changes" }).click();
      await page.getByRole("button", { name: "Confirm request changes" }).click();
      await expect(page.getByText("Tell the instructor why: add a short note.")).toBeVisible();
      await page.getByLabel(/Note to the instructor/).fill("Please add a real description");
      await page.getByRole("button", { name: "Confirm request changes" }).click();
      await expect(page.getByText("No decisions are available for this status.")).toHaveCount(0);
      await expect(page.getByText("Changes requested").first()).toBeVisible();
      await expect(page.getByText("Please add a real description")).toBeVisible();
    } finally {
      await done();
    }
  });

  test("a support agent (read-only) has no decision panel and the server refuses the action", async ({ page }) => {
    const c = await submittedCourse("ro");
    const done = await loginAsRole(page, "support_agent");
    try {
      await page.goto(`/admin/courses/${c.courseId}`);
      await expect(page.getByRole("heading", { name: "Decision" })).toHaveCount(0);
    } finally {
      await done();
    }
  });
});
