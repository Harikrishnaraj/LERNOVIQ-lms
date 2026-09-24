import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { cleanup, createAssignment, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { SUBMISSION_BUCKET, supabaseStorage } from "@/services/storage";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

// F-108 / TEST_PLAN section 8: assignments in the learner UI.
test.describe("learner assignments", () => {
  const svc = serviceClient();
  const tag = uniqueTag("ase");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let learner: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;
  let a: { assignmentId: string };
  let overdue: { assignmentId: string };
  let graded: { assignmentId: string };

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
    course = await createCourse(svc, ins.id, { slug: `${tag}-c`, title: `${tag} Course`, publish: true });
    courseIds.push(course.courseId);
    await svc.from("enrollments").insert({ user_id: learner.id, course_id: course.courseId, version_id: course.versionId });
    a = await createAssignment(svc, course.versionId, { title: `${tag} Report`, instructions: "Write a short report.", dueAt: inHours(48), maxFileMb: 1 });
    overdue = await createAssignment(svc, course.versionId, { title: `${tag} Missed`, dueAt: inHours(-5) });
    graded = await createAssignment(svc, course.versionId, { title: `${tag} Marked`, dueAt: inHours(24), maxPoints: 50 });
    await svc.from("assignment_submissions").insert({
      assignment_id: graded.assignmentId, user_id: learner.id, text_answer: "My old answer", status: "graded", grade: 42, feedback: "Solid effort", graded_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    const { data } = await svc.from("assignment_submissions").select("file_path").eq("user_id", learner.id);
    const paths = (data ?? []).map((r) => r.file_path as string | null).filter(Boolean) as string[];
    if (paths.length) await supabaseStorage.remove(SUBMISSION_BUCKET, paths).catch(() => undefined);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("lists assignments with their status, and submits text and a file", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page, learner);
    await page.goto("/learner/assignments");
    await expect(page.getByRole("heading", { level: 1, name: "Assignments" })).toBeVisible();
    const list = page.getByRole("list", { name: "Assignments" });
    await expect(list.getByRole("listitem").filter({ hasText: `${tag} Report` }).getByText("To do")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: `${tag} Missed` }).getByText("Overdue")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: `${tag} Marked` }).getByText("Graded")).toBeVisible();
    await expect(list.getByRole("listitem").filter({ hasText: `${tag} Marked` }).getByText(/42\/50/)).toBeVisible();

    await list.getByRole("link", { name: `${tag} Report` }).click();
    await page.waitForURL(new RegExp(`/learner/assignments/${a.assignmentId}$`));
    await expect(page.getByRole("heading", { level: 1, name: `${tag} Report` })).toBeVisible();
    await expect(page.getByText("Write a short report.")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Nothing to submit.
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add a written answer or attach a file." })).toBeVisible();

    // A disallowed file type is refused before any upload.
    await page.getByLabel("Attach a file").setInputFiles({ name: "run.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That file type is not allowed" })).toBeVisible();

    // An oversized file is refused.
    await page.getByLabel("Attach a file").setInputFiles({ name: "big.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(1024 * 1024 + 10, 1) });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "1 MB or smaller" })).toBeVisible();

    // Valid text + file.
    await page.getByLabel("Your answer").fill("Here is my report.");
    await page.getByLabel("Attach a file").setInputFiles({ name: "report.txt", mimeType: "text/plain", buffer: Buffer.from("report body") });
    await page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your submission" })).toBeVisible();
    const mine = page.getByRole("region", { name: "Your submission" });
    await expect(mine.getByText("Here is my report.")).toBeVisible();
    await expect(page.getByRole("link", { name: "report.txt" })).toBeVisible();
    await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

    // Resubmitting replaces it before the deadline.
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Your answer").fill("Updated report.");
    await page.getByRole("button", { name: "Resubmit" }).click();
    await expect(mine.getByText("Updated report.")).toBeVisible();
    await expect(page.getByRole("link", { name: "report.txt" })).toHaveCount(0);
  });

  test("overdue work and graded work are locked, and graded work shows the feedback", async ({ page }) => {
    await signIn(page, learner);
    await page.goto(`/learner/assignments/${overdue.assignmentId}`);
    await expect(page.getByText("The deadline has passed and late submissions are not accepted.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Submit your work" })).toHaveCount(0);

    await page.goto(`/learner/assignments/${graded.assignmentId}`);
    await expect(page.getByRole("heading", { name: "Grade and feedback" })).toBeVisible();
    await expect(page.getByText("42 / 50")).toBeVisible();
    await expect(page.getByText("Solid effort")).toBeVisible();
    await expect(page.getByText("This submission has been graded, so it can no longer be changed.")).toBeVisible();
    await expect(page.getByRole("form", { name: "Submit your work" })).toHaveCount(0);
  });

  test("another learner cannot open the assignment", async ({ page }) => {
    const stranger = await createUserWithRole(svc, `${tag}-str`, "learner");
    learnerIds.push(stranger.id);
    await signIn(page, stranger);
    const res = await page.goto(`/learner/assignments/${a.assignmentId}`);
    expect(res?.status()).toBe(404);
    await page.goto("/learner/assignments");
    await expect(page.getByText("No assignments yet")).toBeVisible();
  });
});
