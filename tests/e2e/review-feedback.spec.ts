import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssessment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-211 / TEST_PLAN section 11: the instructor sees review status and section-linked feedback,
// can fix and resubmit, and can reopen a rejection.
test.describe("instructor review feedback", () => {
  const svc = serviceClient();
  const tag = uniqueTag("rfe");
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let instructor: { id: string; email: string; password: string };
  let reviewer: { id: string };

  async function signIn(page: Page, u: { email: string; password: string }) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Password").fill(u.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/instructor");
  }

  test.beforeAll(async () => {
    instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    reviewer = await createUserWithRole(svc, `${tag}-rev`, "content_reviewer");
    userIds.push(instructor.id, reviewer.id);
  });

  test.afterAll(() => cleanup(svc, { learnerIds: [], courseIds, userIds }));

  /** A course that satisfies every readiness rule, currently sent back with feedback. */
  async function sentBackCourse(slug: string, decision: "request_changes" | "reject") {
    const { data: cat } = await svc.from("categories").select("id").limit(1).single();
    const c = await createCourse(svc, instructor.id, {
      slug: `${tag}-${slug}`,
      title: `${tag} ${slug}`,
      publish: false,
      categoryId: cat!.id as string,
      description: "A complete description that is comfortably longer than the fifty character minimum.",
      outcomes: ["Learn things"],
      sections: [{ title: "Basics", lessons: [{ title: "Alpha lesson", content: "<p>Alpha</p>" }] }],
    });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ thumbnail_url: "https://example.com/t.png" }).eq("id", c.versionId);
    await createAssessment(svc, c.versionId, { title: "Quiz", questions: [{ type: "true_false", prompt: "True?", options: ["True", "False"], correct: [0] }] });

    const sectionId = (await svc.from("course_sections").select("id").eq("version_id", c.versionId).single()).data!.id as string;
    await svc.from("course_review_notes").insert([
      { version_id: c.versionId, target_type: "section", target_id: sectionId, target_title: "Basics", body: "Split this section", author_id: reviewer.id },
      { version_id: c.versionId, target_type: "lesson", target_id: c.lessonIds[0], target_title: "Alpha lesson", body: "Add an example here", author_id: reviewer.id },
    ]);
    const to = decision === "reject" ? "rejected" : "changes_requested";
    await svc.from("course_versions").update({ status: to }).eq("id", c.versionId);
    await svc.from("course_reviews").insert({
      version_id: c.versionId, actor_id: reviewer.id, action: decision, from_status: "in_review", to_status: to, note: "Please act on the notes",
    });
    return c;
  }

  test("sees the feedback with links, fixes, resubmits and the version history records it", async ({ page }) => {
    test.setTimeout(120_000);
    const c = await sentBackCourse("changes", "request_changes");
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${c.courseId}`);

    await expect(page.getByRole("heading", { name: "The reviewer asked for changes" })).toBeVisible();
    await expect(page.getByRole("region", { name: "The reviewer asked for changes" }).getByText("Please act on the notes")).toBeVisible();
    const notes = page.getByRole("list", { name: "Reviewer notes" });
    await expect(notes.getByText("Section: Basics")).toBeVisible();
    await expect(notes.getByText("Add an example here")).toBeVisible();

    // The link goes to the lesson that needs work.
    await notes.getByRole("link", { name: "Go to the lesson" }).click();
    await expect(page).toHaveURL(new RegExp(`/lessons/${c.lessonIds[0]}$`));

    // Resubmit.
    await page.goto(`/instructor/courses/${c.courseId}`);
    await page.getByRole("link", { name: "Resubmit when you are done" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByLabel(/Notes for the reviewer/).fill("Added examples");
    await page.getByRole("button", { name: "Resubmit for review" }).click();
    await expect(page.getByText("Submitted. A reviewer will pick this up soon.")).toBeVisible();

    // Overview: status, locked, and the audit trail keeps the earlier decision.
    await page.goto(`/instructor/courses/${c.courseId}`);
    await expect(page.getByText(/is submitted, so it is read-only/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "The reviewer asked for changes" })).toHaveCount(0);
    const history = page.getByRole("heading", { name: "Version history" }).locator("xpath=..");
    await expect(history.getByText("request changes")).toBeVisible();
    await expect(history.getByText("Please act on the notes")).toBeVisible();
  });

  test("a rejected course can be reopened as a draft", async ({ page }) => {
    const c = await sentBackCourse("rejected", "reject");
    await signIn(page, instructor);
    await page.goto(`/instructor/courses/${c.courseId}`);
    await expect(page.getByRole("heading", { name: "This submission was rejected" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Reopen as draft" }).click();
    await expect(page.getByRole("heading", { name: "This submission was rejected" })).toHaveCount(0);
    await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
    await page.goto(`/instructor/courses/${c.courseId}/basics`);
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  test("another instructor cannot see the course or its feedback", async ({ page }) => {
    const c = await sentBackCourse("private", "request_changes");
    const other = await createUserWithRole(svc, `${tag}-oth`, "instructor");
    userIds.push(other.id);
    await signIn(page, other);
    const res = await page.goto(`/instructor/courses/${c.courseId}`);
    expect(res?.status()).toBe(404);
  });
});
