import { expect, test, type Page } from "@playwright/test";
import { loadEnvLocal } from "./support/env";
import { acquireLock } from "./support/global-lock";
import { loginAsRole } from "./support/role-user";
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

  // ai_settings is one platform-wide row: take the shared lock so no other tutor or settings
  // test runs while this one may have the tutor off or its limits changed (global-lock.ts).
  let releaseSettingsLock: (() => void) | undefined;
  test.beforeEach(async ({}, testInfo) => {
    const started = Date.now();
    const budget = testInfo.timeout;
    testInfo.setTimeout(budget + 10 * 60_000);
    releaseSettingsLock = await acquireLock("ai-settings");
    testInfo.setTimeout(budget + (Date.now() - started));
  });
  test.afterEach(() => releaseSettingsLock?.());
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
    await svc.from("enrollments").insert({
      user_id: learner.id,
      course_id: course.courseId,
      version_id: course.versionId,
      status: "active",
    });
  });

  // The settings are platform-wide; every test below that changes them puts the defaults back.
  const restoreSettings = () =>
    svc
      .from("ai_settings")
      .update({
        tutor_enabled: true,
        tutor_model: null,
        max_answer_tokens: 1500,
        daily_question_cap: 150,
        hint_only_always: false,
      })
      .eq("id", true);

  test.afterAll(async () => {
    await restoreSettings();
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

  test("shows a recoverable message when the model fails or times out, then works again", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/learner/ai-tutor?course=${course.slug}`);

    // The offline provider fails on purpose for questions starting with [fake-fail:<reason>].
    const failing = "[fake-fail:timeout] How does chlorophyll work?";
    await ask(page, failing);
    await expect(
      page.getByRole("alert").filter({ hasText: "took too long to answer" }),
    ).toBeVisible();
    // The question stays in the box so the learner can send it again.
    await expect(page.getByLabel("Your question")).toHaveValue(failing);

    await page.getByLabel("Your question").fill("");
    await ask(page, "[fake-fail:error] Try again please");
    await expect(
      page.getByRole("alert").filter({ hasText: "isn't available right now" }),
    ).toBeVisible();

    const question = `What does chlorophyll ${tag} do?`;
    await page.getByLabel("Your question").fill("");
    await ask(page, question);
    await expect(page.getByText(`Fake answer to: ${question} [1]`)).toBeVisible();
  });

  test("stops answering when an admin turns the AI Tutor off, and resumes when it is back on (T-204)", async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const adminContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const adminPage = await adminContext.newPage();
    const done = await loginAsRole(adminPage, "admin");
    try {
      // The learner has the tutor open and ready.
      await signIn(page);
      await page.goto(`/learner/ai-tutor?course=${course.slug}`);
      await expect(page.getByLabel("Your question")).toBeVisible();

      // The admin turns it off for everyone.
      await adminPage.goto("/admin/ai");
      await adminPage.getByRole("button", { name: "Turn off the AI Tutor" }).click();
      await expect(adminPage.getByText("AI Tutor turned off.")).toBeVisible();
      await expect(adminPage.getByRole("button", { name: "Turn on the AI Tutor" })).toBeVisible();

      // The very next question is refused with a clear message.
      await ask(page, `Is anyone there? ${tag}`);
      await expect(
        page.getByRole("alert").filter({ hasText: "turned off for everyone" }),
      ).toBeVisible();

      // Reloading shows the "turned off" state instead of the chat, in the tutor and the player.
      await page.goto("/learner/ai-tutor");
      await expect(page.getByText("The AI Tutor is turned off right now").first()).toBeVisible();
      await expect(page.getByLabel("Your question")).toHaveCount(0);
      await page.goto(`/learner/courses/${course.slug}/learn/${course.lessonIds[0]}`);
      await expect(page.getByRole("heading", { name: "Photosynthesis" }).first()).toBeVisible();
      await expect(page.getByText("The AI Tutor is turned off right now")).toBeVisible();
      await expect(page.getByText("Ask the AI Tutor")).toHaveCount(0);

      // Turned back on, it answers again.
      await adminPage.getByRole("button", { name: "Turn on the AI Tutor" }).click();
      await expect(adminPage.getByText("AI Tutor turned on.")).toBeVisible();
      // Confirm the switch really is on before asking: the admin page shows it after its refresh,
      // and the stored row says so. Then load the tutor until the chat is back.
      await expect(adminPage.getByRole("button", { name: "Turn off the AI Tutor" })).toBeVisible();
      await expect
        .poll(async () => {
          const { data } = await svc
            .from("ai_settings")
            .select("tutor_enabled")
            .eq("id", true)
            .single();
          return data?.tutor_enabled;
        })
        .toBe(true);
      await expect(async () => {
        await page.goto(`/learner/ai-tutor?course=${course.slug}`);
        await expect(page.getByLabel("Your question")).toBeVisible({ timeout: 5_000 });
      }).toPass({ timeout: 30_000 });
      const question = `Back again ${tag}`;
      await ask(page, question);
      await expect(page.getByText(`Fake answer to: ${question}`)).toBeVisible();

      // Both changes are in the audit log.
      const { data: audit } = await svc
        .from("audit_logs")
        .select("metadata")
        .eq("action", "ai.settings_updated")
        .eq("actor_id", done.userId)
        .order("created_at", { ascending: false })
        .limit(2);
      expect(
        audit?.map((a) => (a.metadata as { after: { tutorEnabled: boolean } }).after.tutorEnabled),
      ).toEqual([true, false]);
    } finally {
      await restoreSettings();
      await done();
      await adminContext.close();
    }
  });

  test("enforces the daily question limit an admin sets", async ({ page }) => {
    try {
      await svc.from("ai_settings").update({ daily_question_cap: 1 }).eq("id", true);
      await signIn(page);
      await page.goto(`/learner/ai-tutor?course=${course.slug}`);
      // This learner already asked more than one question today.
      await ask(page, `One more ${tag}`);
      await expect(
        page.getByRole("alert").filter({ hasText: "today's limit of 1 AI Tutor question" }),
      ).toBeVisible();

      await svc.from("ai_settings").update({ daily_question_cap: 150 }).eq("id", true);
      await ask(page, `One more ${tag}`);
      await expect(page.getByText(`Fake answer to: One more ${tag}`)).toBeVisible();
    } finally {
      await restoreSettings();
    }
  });

  test("gives hints only, for every learner, when an admin turns that on", async ({ page }) => {
    try {
      await svc.from("ai_settings").update({ hint_only_always: true }).eq("id", true);
      await signIn(page);
      await page.goto(`/learner/ai-tutor?course=${course.slug}`);
      await expect(page.getByRole("status").filter({ hasText: "Hint-only mode" })).toBeVisible();
      await page.goto(`/learner/courses/${course.slug}/learn/${course.lessonIds[0]}`);
      await page.getByText("Ask the AI Tutor").click();
      await expect(page.getByRole("status").filter({ hasText: "Hint-only mode" })).toBeVisible();
    } finally {
      await restoreSettings();
    }
  });
});
