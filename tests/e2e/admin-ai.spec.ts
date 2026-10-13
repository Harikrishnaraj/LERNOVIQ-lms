import { expect, test } from "@playwright/test";
import { loginAsRole } from "./support/role-user";
import { loadEnvLocal } from "./support/env";
import { acquireLock } from "./support/global-lock";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

loadEnvLocal();
test.use({ storageState: { cookies: [], origins: [] } });

// F-704 (T-204, ADR-045): admin AI management at /admin/ai: usage and cost from the database,
// who has the tutor, and the model and limits form, which is audited. The kill switch is covered
// in ai-tutor.spec.ts (it needs a learner), because flipping it affects every tutor test.
test.describe("admin AI management", () => {
  const svc = serviceClient();
  const tag = uniqueTag("adai");
  const model = `${tag}-model`;
  const learnerIds: string[] = [];
  let learner: { id: string; email: string };
  let original: Record<string, unknown>;

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

  test.beforeAll(async () => {
    const { data } = await svc.from("ai_settings").select("*").eq("id", true).single();
    original = data!;

    learner = await createUserWithRole(svc, `${tag}-lrn`, "learner", {
      fullName: `${tag} Heavy User`,
    });
    learnerIds.push(learner.id);

    const { data: conv } = await svc
      .from("ai_conversations")
      .insert({ user_id: learner.id, feature: "tutor" })
      .select("id")
      .single();
    // 12 questions, so this learner is the busiest user on the platform: 9 answered (3 without a
    // known price), 1 timeout, 1 fixed "not in the course" answer, 1 error.
    const rows: Record<string, unknown>[] = [];
    const reply = (extra: Record<string, unknown>) => {
      rows.push({ conversation_id: conv!.id, role: "user", content: `${tag} question` });
      rows.push({ conversation_id: conv!.id, role: "assistant", content: "answer", ...extra });
    };
    for (let i = 0; i < 6; i++) {
      reply({
        provider: "groq",
        model,
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.01,
        latency_ms: 1000,
      });
    }
    for (let i = 0; i < 3; i++) {
      reply({
        provider: "groq",
        model,
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: null,
        latency_ms: 1000,
      });
    }
    reply({ provider: "groq", model, status: "timeout", latency_ms: 20000 });
    reply({ provider: null, model: null, cost_usd: null });
    reply({ provider: "groq", model, status: "error", error_code: "http_500" });
    const { error } = await svc.from("ai_messages").insert(rows, { defaultToNull: false });
    if (error) throw error;

    await svc.from("ai_tutor_access").insert({ user_id: learner.id });
  });

  test.afterAll(async () => {
    await svc
      .from("ai_settings")
      .update({
        tutor_model: original.tutor_model,
        max_answer_tokens: original.max_answer_tokens,
        updated_by: original.updated_by,
      })
      .eq("id", true);
    await cleanup(svc, { learnerIds });
  });

  test("shows usage and cost, top users and who has the tutor (T-204)", async ({ page }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/ai");
      await expect(page.getByRole("heading", { level: 1, name: "AI Management" })).toBeVisible();

      // Totals for the period (30 days by default); other tests may add more, so only lower bounds.
      await expect(page.getByText("Questions asked")).toBeVisible();
      await expect(page.getByText("Not in the course").first()).toBeVisible();

      // By model: the model this test wrote, with its exact numbers and an honest cost.
      const modelRow = page.getByRole("row", { name: new RegExp(model) });
      await expect(modelRow).toBeVisible();
      await expect(modelRow).toContainText("$0.06 + 3 at unknown price");
      await expect(modelRow).toContainText("900 / 450");

      // Top users link to the admin user page.
      const top = page.getByRole("list", { name: "Top users by questions" });
      await expect(top.getByRole("link", { name: `${tag} Heavy User` })).toHaveAttribute(
        "href",
        `/admin/users/${learner.id}`,
      );
      await expect(top).toContainText("12 questions");

      // The daily chart has an accessible table of the same numbers.
      await page.getByText("View the numbers").click();
      await expect(page.getByRole("table", { name: "AI Tutor usage per day" })).toBeVisible();

      // Access overview.
      const access = page.getByRole("table", { name: "Users with AI Tutor access" });
      const accessRow = access.getByRole("row", { name: new RegExp(learner.email) });
      await expect(accessRow.getByRole("link", { name: `${tag} Heavy User` })).toHaveAttribute(
        "href",
        `/admin/users/${learner.id}`,
      );

      // Period switch.
      await page.getByRole("link", { name: "7 days" }).click();
      await expect(page).toHaveURL(/[?&]days=7/);
      await expect(page.getByRole("link", { name: "7 days" })).toHaveAttribute(
        "aria-current",
        "true",
      );
      await expect(page.getByRole("row", { name: new RegExp(model) })).toBeVisible();
    } finally {
      await done();
    }
  });

  test("changes the model and answer length, validates them and audits the change (T-204)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const done = await loginAsRole(page, "admin");
    try {
      await page.goto("/admin/ai");
      const form = page.getByRole("form", { name: "AI Tutor settings" });
      await expect(form).toBeVisible();

      // Out of range: refused with a clear message, nothing saved.
      await form.getByLabel("Longest answer (tokens)").fill("5000");
      await form.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText(/from 300 to 3000 tokens/)).toBeVisible();
      await form.getByLabel("Questions per learner per day").fill("0");
      await form.getByLabel("Longest answer (tokens)").fill("900");
      await form.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText(/from 1 to 150 questions/)).toBeVisible();
      const { data: untouched } = await svc
        .from("ai_settings")
        .select("max_answer_tokens")
        .eq("id", true)
        .single();
      expect(untouched!.max_answer_tokens).toBe(original.max_answer_tokens);

      // Valid change.
      await form
        .getByLabel("Questions per learner per day")
        .fill(String(original.daily_question_cap));
      await form.getByLabel("Model").selectOption("openai/gpt-oss-20b");
      await form.getByRole("button", { name: "Save settings" }).click();
      await expect(page.getByText("Settings saved.")).toBeVisible();

      const { data: saved } = await svc
        .from("ai_settings")
        .select("tutor_model, max_answer_tokens, updated_by")
        .eq("id", true)
        .single();
      expect(saved).toMatchObject({ tutor_model: "openai/gpt-oss-20b", max_answer_tokens: 900 });

      // It persists across a reload.
      await page.reload();
      const reloaded = page.getByRole("form", { name: "AI Tutor settings" });
      await expect(reloaded.getByLabel("Model")).toHaveValue("openai/gpt-oss-20b");
      await expect(reloaded.getByLabel("Longest answer (tokens)")).toHaveValue("900");

      // The change is in the audit log with before and after.
      const { data: audit } = await svc
        .from("audit_logs")
        .select("metadata")
        .eq("action", "ai.settings_updated")
        .eq("actor_id", saved!.updated_by as string)
        .order("created_at", { ascending: false })
        .limit(1);
      expect(audit?.[0].metadata).toMatchObject({
        changed: expect.arrayContaining(["tutorModel", "maxAnswerTokens"]),
        after: { tutorModel: "openai/gpt-oss-20b", maxAnswerTokens: 900 },
      });
    } finally {
      await done();
    }
  });
});
