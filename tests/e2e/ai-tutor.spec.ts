import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";
import { runKnowledgeIngest } from "@/features/knowledge/ingest";
import type { EmbeddingProvider } from "@/services/embeddings";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

const keywordOnly: EmbeddingProvider = {
  name: "openai",
  model: "text-embedding-3-small",
  embed: async () => ({
    ok: false,
    provider: "openai",
    model: "m",
    reason: "not_configured",
    code: "missing_api_key",
  }),
};

// F-701 (T-201, T-224, TEST_PLAN §15): the learner AI Tutor, answered by the offline fake
// provider (AI_PROVIDER=fake in CI): off until an admin turns it on, answers from the course with
// a link to the lesson, offers the course discussion for what the course doesn't cover, and is
// available beside the lesson in the course player.
test.describe("learner AI Tutor", () => {
  // The tests share one learner whose access changes along the way, so they run in order.
  test.describe.configure({ mode: "serial" });
  const svc = serviceClient();
  const tag = uniqueTag("tut");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  let learner: { id: string; email: string; password: string };
  let course: Awaited<ReturnType<typeof createCourse>>;

  async function signIn(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(learner.email);
    await page.getByLabel("Password").fill(learner.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/learner");
  }

  async function ask(page: Page, question: string) {
    await page.getByLabel("Your question").fill(question);
    await page.getByRole("button", { name: "Ask" }).click();
  }

  test.beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(instructor.id);
    course = await createCourse(svc, instructor.id, {
      slug: `${tag}-botany`,
      title: `${tag} Botany`,
      sections: [
        {
          title: "Plants",
          lessons: [
            {
              title: "Photosynthesis",
              content: `<p>Chlorophyll ${tag} captures light energy for the plant.</p>`,
            },
          ],
        },
      ],
    });
    courseIds.push(course.courseId);
    await runKnowledgeIngest({ db: svc, embedder: keywordOnly, versionId: course.versionId });

    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerIds.push(learner.id);
    await svc
      .from("enrollments")
      .insert({
        user_id: learner.id,
        course_id: course.courseId,
        version_id: course.versionId,
        status: "active",
      });
  });

  test.afterAll(async () => {
    await cleanup(svc, { learnerIds, courseIds, userIds });
  });

  test("stays off until an admin turns it on", async ({ page }) => {
    await signIn(page);
    await page.goto("/learner/ai-tutor");
    await expect(page.getByText("The AI Tutor isn't turned on for your account")).toBeVisible();
    await expect(page.getByLabel("Your question")).toHaveCount(0);

    // No panel in the player either.
    await page.goto(`/learner/courses/${course.slug}/learn/${course.lessonIds[0]}`);
    await expect(page.getByRole("heading", { name: "Photosynthesis" }).first()).toBeVisible();
    await expect(page.getByText("Ask the AI Tutor")).toHaveCount(0);
  });

  test("answers an approved learner from the course with a link to the lesson", async ({
    page,
  }) => {
    await svc.from("ai_tutor_access").upsert({ user_id: learner.id }, { onConflict: "user_id" });
    await signIn(page);
    await page.goto(`/learner/ai-tutor?course=${course.slug}`);
    await expect(page.getByText(`Ask about ${tag} Botany`)).toBeVisible();

    const question = `How does chlorophyll ${tag} work?`;
    await ask(page, question);
    await expect(page.getByText(`Fake answer to: ${question} [1]`)).toBeVisible();
    const source = page
      .getByRole("list", { name: "Sources" })
      .getByRole("link", { name: "Photosynthesis" });
    await expect(source).toHaveAttribute(
      "href",
      `/learner/courses/${course.slug}/learn/${course.lessonIds[0]}`,
    );

    // The conversation is kept and can be reopened.
    const earlier = page.getByRole("navigation", { name: "Earlier conversations" });
    await earlier.getByRole("link", { name: new RegExp(`How does chlorophyll ${tag}`) }).click();
    await expect(page).toHaveURL(/[?&]c=/);
    await expect(page.getByText(`Fake answer to: ${question} [1]`)).toBeVisible();
  });

  test("offers the course discussion for a question the course doesn't cover", async ({ page }) => {
    await signIn(page);
    await page.goto(`/learner/ai-tutor?course=${course.slug}`);
    await ask(page, "Who painted the Mona Lisa?");
    await expect(page.getByText(/couldn't find this in your course materials/)).toBeVisible();

    await page.getByRole("link", { name: "Post this in the course discussion" }).click();
    const form = page.getByRole("form", { name: "Start a discussion" });
    await expect(form).toBeVisible();
    await expect(form.getByLabel("Title")).toHaveValue("Who painted the Mona Lisa?");
    await expect(form.getByLabel("Course")).toHaveValue(course.courseId);
  });

  test("is available beside the lesson in the course player", async ({ page }) => {
    await signIn(page);
    await page.goto(`/learner/courses/${course.slug}/learn/${course.lessonIds[0]}`);
    await page.getByText("Ask the AI Tutor").click();
    const question = `Explain chlorophyll ${tag}`;
    await ask(page, question);
    await expect(page.getByText(`Fake answer to: ${question} [1]`)).toBeVisible();
  });
});
