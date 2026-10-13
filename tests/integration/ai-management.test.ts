import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { getAiUsageReport, listAiTutorAccess } from "@/features/admin/ai-management";
import { getAiSettings } from "@/features/ai/settings";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const DAY_MS = 24 * 60 * 60 * 1000;

// F-704 (T-204, ADR-045): usage and cost are aggregated in SQL and readable only with
// ai.read_all; the AI settings are readable by signed-in users but changed only with
// ai.manage_settings and within bounds; the access list needs ai.manage_access. The suite never
// flips the kill switch, hint-only mode or the daily cap: other suites share this database and
// their tutor questions would start failing.
describe.skipIf(!hasLiveProject)("AI management (T-204, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("aimgmt");
  const model = `${tag}-model`;
  const learnerIds: string[] = [];
  const userIds: string[] = [];
  type U = { id: string; email: string; client: SupabaseClient };
  let admin: U, learner: U, other: U, instructor: U;
  let original: Record<string, unknown>;

  async function user(name: string, role: string, opts: { fullName?: string } = {}): Promise<U> {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role, opts);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({
      email: u.email,
      password: u.password,
    });
    if (error) throw error;
    return { id: u.id, email: u.email, client };
  }

  /** One question and the assistant's reply, written the way runChatTurn records a turn. */
  async function turn(
    conversationId: string,
    reply: Record<string, unknown>,
    createdAt = new Date().toISOString(),
  ) {
    const q = await svc.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: `${tag} question`,
      created_at: createdAt,
    });
    if (q.error) throw q.error;
    const a = await svc.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: "answer",
      created_at: createdAt,
      ...reply,
    });
    if (a.error) throw a.error;
  }

  beforeAll(async () => {
    admin = await user("adm", "admin", { fullName: `${tag} Admin` });
    learner = await user("lrn", "learner", { fullName: `${tag} Learner` });
    other = await user("oth", "learner");
    instructor = await user("ins", "instructor");

    const { data } = await svc.from("ai_settings").select("*").eq("id", true).single();
    original = data!;

    const { data: conv, error } = await svc
      .from("ai_conversations")
      .insert({ user_id: learner.id, feature: "tutor" })
      .select("id")
      .single();
    if (error) throw error;
    const c = conv!.id as string;
    const groq = { provider: "groq", model };
    // 12 questions in the last days: 6 priced answers, 2 unpriced, 1 "not in the course", and
    // a timeout, an error and a rate limit.
    for (let i = 0; i < 6; i++) {
      await turn(c, {
        ...groq,
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: 0.01,
        latency_ms: 1000,
      });
    }
    for (let i = 0; i < 2; i++) {
      await turn(c, {
        ...groq,
        input_tokens: 100,
        output_tokens: 50,
        cost_usd: null,
        latency_ms: 3000,
      });
    }
    await turn(c, { provider: null, model: null, cost_usd: null });
    await turn(c, { ...groq, status: "timeout", latency_ms: 20000 });
    await turn(c, { ...groq, status: "error", error_code: "http_500" });
    await turn(c, { ...groq, status: "rate_limited", error_code: "http_429" });
    // An answer from 40 days ago: inside the 90 day report only.
    await turn(
      c,
      { ...groq, input_tokens: 10, output_tokens: 10, cost_usd: 0.5, latency_ms: 500 },
      new Date(Date.now() - 40 * DAY_MS).toISOString(),
    );

    await svc.from("ai_tutor_access").insert({ user_id: learner.id, granted_by: admin.id });
  }, 200_000);

  afterAll(async () => {
    if (original) {
      await svc
        .from("ai_settings")
        .update({
          tutor_enabled: original.tutor_enabled,
          tutor_model: original.tutor_model,
          max_answer_tokens: original.max_answer_tokens,
          daily_question_cap: original.daily_question_cap,
          hint_only_always: original.hint_only_always,
          updated_by: original.updated_by,
        })
        .eq("id", true);
    }
    await cleanup(svc, { learnerIds, userIds });
  }, 120_000);

  describe("usage report", () => {
    it("aggregates the test model exactly: counts, tokens, cost, unpriced and latency", async () => {
      const report = await getAiUsageReport(admin.client, 30);
      expect(report.days).toBe(30);
      const row = report.byModel.find((m) => m.model === model);
      expect(row).toMatchObject({
        answered: 8,
        failed: 3,
        inputTokens: 800,
        outputTokens: 400,
        unpriced: 2,
        avgLatencyMs: 1500,
      });
      // Unpriced answers are left out of the sum, never guessed.
      expect(row!.costUsd).toBeCloseTo(0.06, 6);
    });

    it("counts failures by status and the fixed 'not in the course' answers separately", async () => {
      const { totals } = await getAiUsageReport(admin.client, 30);
      expect(totals.questions).toBeGreaterThanOrEqual(12);
      expect(totals.answered).toBeGreaterThanOrEqual(8);
      expect(totals.noSources).toBeGreaterThanOrEqual(1);
      expect(totals.failed.timeout).toBeGreaterThanOrEqual(1);
      expect(totals.failed.error).toBeGreaterThanOrEqual(1);
      expect(totals.failed.rateLimited).toBeGreaterThanOrEqual(1);
      expect(totals.unpriced).toBeGreaterThanOrEqual(2);
      expect(totals.costUsd).not.toBeNull();
    });

    it("lists the busiest users with their name, question count and cost", async () => {
      const { topUsers } = await getAiUsageReport(admin.client, 30);
      expect(topUsers.length).toBeLessThanOrEqual(10);
      const me = topUsers.find((u) => u.userId === learner.id);
      expect(me).toMatchObject({ name: `${tag} Learner`, email: learner.email, questions: 12 });
      expect(me!.costUsd).toBeCloseTo(0.06, 6);
    });

    it("returns one entry per day for the period, ending today", async () => {
      for (const days of [7, 30, 90] as const) {
        const { daily, since, until } = await getAiUsageReport(admin.client, days);
        expect(daily).toHaveLength(days);
        expect(daily[0].day).toBe(since);
        expect(daily.at(-1)!.day).toBe(until);
        expect(until).toBe(new Date().toISOString().slice(0, 10));
      }
      const { daily } = await getAiUsageReport(admin.client, 7);
      expect(daily.at(-1)).toMatchObject({
        noSources: expect.any(Number),
        failed: expect.any(Number),
      });
      expect(daily.at(-1)!.questions).toBeGreaterThanOrEqual(12);
    });

    it("includes older answers only in the longer periods", async () => {
      const m30 = (await getAiUsageReport(admin.client, 30)).byModel.find((m) => m.model === model);
      const m90 = (await getAiUsageReport(admin.client, 90)).byModel.find((m) => m.model === model);
      expect(m30!.answered).toBe(8);
      expect(m90!.answered).toBe(9);
      expect(m90!.costUsd).toBeCloseTo(0.56, 6);
      expect(m90!.inputTokens).toBe(810);
    });

    it("refuses any period other than 7, 30 or 90 days", async () => {
      const { error } = await admin.client.rpc("ai_usage_report", { p_days: 14 });
      expect(error?.code).toBe("22023");
      expect((await admin.client.rpc("ai_usage_report", { p_days: null })).error).not.toBeNull();
    });

    it("refuses everyone without ai.read_all, including signed-out callers", async () => {
      for (const who of [learner, other, instructor]) {
        const { data, error } = await who.client.rpc("ai_usage_report", { p_days: 30 });
        expect(data).toBeNull();
        expect(error?.code).toBe("42501");
      }
      expect((await anon().rpc("ai_usage_report", { p_days: 30 })).error).not.toBeNull();
    });
  });

  describe("access list", () => {
    it("lists who has the tutor with email, who turned it on and when", async () => {
      const list = await listAiTutorAccess(admin.client, 200);
      expect(list.total).toBeGreaterThanOrEqual(1);
      expect(list.users.find((u) => u.userId === learner.id)).toMatchObject({
        name: `${tag} Learner`,
        email: learner.email,
        grantedByName: `${tag} Admin`,
        grantedAt: expect.any(String),
      });
    });

    it("limits the list but still reports the full count", async () => {
      const one = await listAiTutorAccess(admin.client, 1);
      expect(one.users).toHaveLength(1);
      expect(one.total).toBeGreaterThanOrEqual(1);
    });

    it("is closed to everyone without ai.manage_access", async () => {
      for (const who of [learner, instructor]) {
        const { error } = await who.client.rpc("ai_tutor_access_list", { p_limit: 5 });
        expect(error?.code).toBe("42501");
      }
      expect((await anon().rpc("ai_tutor_access_list", { p_limit: 5 })).error).not.toBeNull();
    });
  });

  describe("daily question count", () => {
    it("counts only the caller's own tutor questions since the given time", async () => {
      const since = new Date(Date.now() - DAY_MS).toISOString();
      const mine = await learner.client.rpc("ai_tutor_questions_since", { p_since: since });
      expect(mine.data).toBe(12);
      const theirs = await other.client.rpc("ai_tutor_questions_since", { p_since: since });
      expect(theirs.data).toBe(0);
      // An admin cannot ask about someone else: the function is bound to auth.uid().
      const admins = await admin.client.rpc("ai_tutor_questions_since", { p_since: since });
      expect(admins.data).toBe(0);
    });

    it("leaves out questions before the window and counts the older one in a longer window", async () => {
      const future = new Date(Date.now() + DAY_MS).toISOString();
      expect((await learner.client.rpc("ai_tutor_questions_since", { p_since: future })).data).toBe(
        0,
      );
      const longer = new Date(Date.now() - 60 * DAY_MS).toISOString();
      expect((await learner.client.rpc("ai_tutor_questions_since", { p_since: longer })).data).toBe(
        13,
      );
    });

    it("is closed to signed-out callers", async () => {
      const { error } = await anon().rpc("ai_tutor_questions_since", {
        p_since: new Date().toISOString(),
      });
      expect(error).not.toBeNull();
    });
  });

  describe("settings", () => {
    it("are readable by any signed-in user, so the learner screens can say the tutor is off", async () => {
      for (const who of [learner, instructor, admin]) {
        expect(await getAiSettings(who.client)).not.toBeNull();
      }
    });

    it("are hidden from signed-out visitors", async () => {
      const { data } = await anon().from("ai_settings").select("tutor_enabled");
      expect(data ?? []).toEqual([]);
    });

    it("can be changed by an admin, who is recorded as the editor", async () => {
      const { data, error } = await admin.client
        .from("ai_settings")
        .update({
          max_answer_tokens: 1000,
          tutor_model: "openai/gpt-oss-20b",
          updated_by: admin.id,
        })
        .eq("id", true)
        .select("max_answer_tokens, tutor_model, updated_by");
      expect(error).toBeNull();
      expect(data).toEqual([
        { max_answer_tokens: 1000, tutor_model: "openai/gpt-oss-20b", updated_by: admin.id },
      ]);
      expect(await getAiSettings(learner.client)).toMatchObject({
        maxAnswerTokens: 1000,
        tutorModel: "openai/gpt-oss-20b",
      });
      const reset = await admin.client
        .from("ai_settings")
        .update({
          max_answer_tokens: original.max_answer_tokens,
          tutor_model: original.tutor_model,
        })
        .eq("id", true);
      expect(reset.error).toBeNull();
    });

    it("cannot be changed by learners or instructors", async () => {
      for (const who of [learner, instructor]) {
        const { data } = await who.client
          .from("ai_settings")
          .update({ tutor_enabled: false })
          .eq("id", true)
          .select("tutor_enabled");
        expect(data ?? []).toEqual([]);
      }
      const { data } = await svc
        .from("ai_settings")
        .select("tutor_enabled")
        .eq("id", true)
        .single();
      expect(data!.tutor_enabled).toBe(original.tutor_enabled);
    });

    it("refuses values outside the bounds and models off the allow-list, even from an admin", async () => {
      for (const bad of [
        { max_answer_tokens: 299 },
        { max_answer_tokens: 3001 },
        { daily_question_cap: 0 },
        { daily_question_cap: 151 },
        { tutor_model: "some/other-model" },
      ]) {
        const { error } = await admin.client.from("ai_settings").update(bad).eq("id", true);
        expect(error, JSON.stringify(bad)).not.toBeNull();
      }
    });

    it("stays a single row that nobody can add to, delete or re-key", async () => {
      const insert = await admin.client.from("ai_settings").insert({ id: false });
      expect(insert.error).not.toBeNull();
      const remove = await admin.client.from("ai_settings").delete().eq("id", true).select("id");
      expect(remove.error ?? remove.data?.length === 0).toBeTruthy();
      const rekey = await admin.client.from("ai_settings").update({ id: false }).eq("id", true);
      expect(rekey.error).not.toBeNull();
      const { data } = await svc.from("ai_settings").select("id");
      expect(data).toEqual([{ id: true }]);
    });
  });
});
