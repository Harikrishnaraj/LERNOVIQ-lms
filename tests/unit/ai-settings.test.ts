// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// F-704 (T-204, ADR-045): the AI Tutor settings are validated, only holders of ai.manage_settings
// can change them, every change is audited with before and after, and unreadable settings never
// turn into "run without limits". Also the usage report parsing and cost wording of /admin/ai.

const { state, canMock, auditMock, updateMock, revalidateMock } = vi.hoisted(() => ({
  state: {
    user: { id: "admin-1", email: "admin@example.com" } as { id: string; email: string } | null,
    row: null as Record<string, unknown> | null,
    readError: false,
  },
  canMock: vi.fn(),
  auditMock: vi.fn(),
  updateMock: vi.fn(),
  revalidateMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidateMock }));
vi.mock("@/lib/permissions/can", () => ({ can: canMock }));
vi.mock("@/services/audit", () => ({ recordAudit: auditMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            state.readError
              ? { data: null, error: { message: "down" } }
              : { data: state.row, error: null },
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: () => ({ select: () => updateMock(values) }),
      }),
    }),
  }),
}));

import { updateAiSettings } from "@/features/admin/ai-settings-actions";
import {
  costLabel,
  formatUsd,
  parseUsagePeriod,
  parseUsageReport,
  totalFailures,
} from "@/features/admin/ai-management";
import { getAiSettings, toAiSettings, toAiSettingsRow } from "@/features/ai/settings";
import {
  DEFAULT_AI_SETTINGS,
  TUTOR_MODELS,
  changedAiSettings,
  validateAiSettingsInput,
} from "@/features/ai/settings-rules";

const row = {
  tutor_enabled: true,
  tutor_model: null,
  max_answer_tokens: 1500,
  daily_question_cap: 150,
  hint_only_always: false,
};

describe("validateAiSettingsInput", () => {
  it("accepts any single field, so the kill switch can save on its own", () => {
    expect(validateAiSettingsInput({ tutorEnabled: false })).toEqual({
      ok: true,
      value: { tutorEnabled: false },
    });
    expect(validateAiSettingsInput({ tutorModel: null })).toEqual({
      ok: true,
      value: { tutorModel: null },
    });
  });

  it("accepts every allow-listed model and nothing else", () => {
    for (const model of TUTOR_MODELS) {
      expect(validateAiSettingsInput({ tutorModel: model })).toMatchObject({ ok: true });
    }
    for (const bad of ["gpt-4", "openai/gpt-oss-120b ", "", undefined, 5]) {
      expect(validateAiSettingsInput({ tutorModel: bad })).toMatchObject({ ok: false });
    }
  });

  it("bounds the answer length to 300 to 3000 whole tokens", () => {
    for (const ok of [300, 1500, 3000]) {
      expect(validateAiSettingsInput({ maxAnswerTokens: ok })).toMatchObject({ ok: true });
    }
    for (const bad of [299, 3001, 0, -1, 1500.5, Number.NaN, "1500", null]) {
      expect(validateAiSettingsInput({ maxAnswerTokens: bad })).toMatchObject({ ok: false });
    }
  });

  it("bounds the daily question cap to 1 to 150 whole questions", () => {
    for (const ok of [1, 20, 150]) {
      expect(validateAiSettingsInput({ dailyQuestionCap: ok })).toMatchObject({ ok: true });
    }
    for (const bad of [0, 151, -5, 2.5, Number.NaN, "20", Infinity]) {
      expect(validateAiSettingsInput({ dailyQuestionCap: bad })).toMatchObject({ ok: false });
    }
  });

  it("needs real booleans for the switches", () => {
    expect(validateAiSettingsInput({ tutorEnabled: "false" })).toMatchObject({ ok: false });
    expect(validateAiSettingsInput({ hintOnlyAlways: 1 })).toMatchObject({ ok: false });
    expect(validateAiSettingsInput({ hintOnlyAlways: true })).toMatchObject({ ok: true });
  });

  it("refuses empty input, non-objects and unknown settings", () => {
    for (const bad of [
      null,
      undefined,
      "x",
      [],
      {},
      { updatedBy: "someone" },
      { tutorEnabled: true, id: 2 },
    ]) {
      expect(validateAiSettingsInput(bad)).toMatchObject({ ok: false });
    }
  });
});

describe("settings mapping", () => {
  it("defaults match the table defaults", () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      tutorEnabled: true,
      tutorModel: null,
      maxAnswerTokens: 1500,
      dailyQuestionCap: 150,
      hintOnlyAlways: false,
    });
    expect(toAiSettings(row)).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("treats a model outside the allow-list as 'server default'", () => {
    expect(toAiSettings({ ...row, tutor_model: "some/old-model" }).tutorModel).toBeNull();
    expect(toAiSettings({ ...row, tutor_model: "openai/gpt-oss-20b" }).tutorModel).toBe(
      "openai/gpt-oss-20b",
    );
  });

  it("maps only the fields it is given to columns", () => {
    expect(toAiSettingsRow({ hintOnlyAlways: true, tutorModel: null })).toEqual({
      hint_only_always: true,
      tutor_model: null,
    });
  });

  it("lists which fields changed", () => {
    expect(changedAiSettings(DEFAULT_AI_SETTINGS, DEFAULT_AI_SETTINGS)).toEqual([]);
    expect(
      changedAiSettings(DEFAULT_AI_SETTINGS, {
        ...DEFAULT_AI_SETTINGS,
        tutorEnabled: false,
        dailyQuestionCap: 20,
      }),
    ).toEqual(["tutorEnabled", "dailyQuestionCap"]);
  });
});

describe("getAiSettings", () => {
  beforeEach(() => {
    state.row = row;
    state.readError = false;
  });

  async function read() {
    const { createClient } = await import("@/lib/supabase/server");
    return getAiSettings((await createClient()) as unknown as SupabaseClient);
  }

  it("reads the row", async () => {
    state.row = { ...row, tutor_enabled: false, daily_question_cap: 12 };
    expect(await read()).toMatchObject({ tutorEnabled: false, dailyQuestionCap: 12 });
  });

  it("falls back to the defaults when the row is missing", async () => {
    state.row = null;
    expect(await read()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("returns null (callers fail closed) when the read errors", async () => {
    state.readError = true;
    expect(await read()).toBeNull();
  });
});

describe("updateAiSettings", () => {
  beforeEach(() => {
    state.user = { id: "admin-1", email: "admin@example.com" };
    state.row = row;
    state.readError = false;
    canMock.mockReset().mockResolvedValue(true);
    auditMock.mockReset().mockResolvedValue(true);
    revalidateMock.mockReset();
    updateMock.mockReset().mockResolvedValue({ data: [{ tutor_enabled: false }], error: null });
  });

  it("saves the change, audits before and after, and refreshes the screen", async () => {
    expect(await updateAiSettings({ tutorEnabled: false, dailyQuestionCap: 20 })).toEqual({
      ok: true,
    });
    expect(canMock).toHaveBeenCalledWith(expect.anything(), "admin-1", "ai.manage_settings");
    expect(updateMock).toHaveBeenCalledWith({
      tutor_enabled: false,
      daily_question_cap: 20,
      updated_by: "admin-1",
    });
    expect(auditMock).toHaveBeenCalledWith({
      actorId: "admin-1",
      actorEmail: "admin@example.com",
      action: "ai.settings_updated",
      resourceType: "ai_settings",
      metadata: {
        changed: ["tutorEnabled", "dailyQuestionCap"],
        before: DEFAULT_AI_SETTINGS,
        after: { ...DEFAULT_AI_SETTINGS, tutorEnabled: false, dailyQuestionCap: 20 },
      },
    });
    expect(revalidateMock).toHaveBeenCalledWith("/admin/ai");
  });

  it("does nothing, and audits nothing, when no value changes", async () => {
    expect(await updateAiSettings({ tutorEnabled: true, maxAnswerTokens: 1500 })).toEqual({
      ok: true,
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("refuses signed-out callers and users without ai.manage_settings", async () => {
    state.user = null;
    expect(await updateAiSettings({ tutorEnabled: false })).toMatchObject({
      ok: false,
      error: "Please log in again.",
    });
    state.user = { id: "learner-1", email: "l@example.com" };
    canMock.mockResolvedValue(false);
    expect(await updateAiSettings({ tutorEnabled: false })).toMatchObject({
      ok: false,
      error: expect.stringContaining("permission"),
    });
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects invalid values before touching the database", async () => {
    for (const bad of [
      { maxAnswerTokens: 99999 },
      { dailyQuestionCap: 0 },
      { tutorModel: "gpt-9" },
      { tutorEnabled: "no" },
      {},
    ]) {
      expect(await updateAiSettings(bad)).toMatchObject({ ok: false });
    }
    expect(updateMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("does not audit a change that failed to save, or that RLS filtered out", async () => {
    updateMock.mockResolvedValue({ data: null, error: { message: "down" } });
    expect(await updateAiSettings({ tutorEnabled: false })).toMatchObject({ ok: false });
    updateMock.mockResolvedValue({ data: [], error: null });
    expect(await updateAiSettings({ tutorEnabled: false })).toMatchObject({ ok: false });
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("will not save blind when the current settings cannot be read", async () => {
    state.readError = true;
    expect(await updateAiSettings({ tutorEnabled: false })).toMatchObject({ ok: false });
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("usage report parsing", () => {
  it("turns the function's JSON into typed numbers, keeping unknown prices null", () => {
    const report = parseUsageReport(
      {
        since: "2026-10-07",
        until: "2026-10-13",
        totals: {
          questions: 12,
          answered: "8",
          no_sources: 2,
          failed_timeout: 1,
          failed_rate_limited: 0,
          failed_error: 1,
          failed_not_configured: 0,
          input_tokens: 5000,
          output_tokens: "900",
          cost_usd: "0.012345",
          unpriced: 3,
          avg_latency_ms: "1250",
        },
        daily: [
          {
            day: "2026-10-13",
            questions: 12,
            answered: 8,
            no_sources: 2,
            failed: 2,
            cost_usd: null,
          },
        ],
        by_model: [
          {
            model: "openai/gpt-oss-120b",
            answered: 8,
            failed: 2,
            input_tokens: 5000,
            output_tokens: 900,
            cost_usd: null,
            unpriced: 8,
            avg_latency_ms: null,
          },
        ],
        top_users: [
          { user_id: "u1", name: "Ada", email: "ada@example.com", questions: 9, cost_usd: "0.01" },
        ],
      },
      7,
    );
    expect(report.totals).toMatchObject({
      questions: 12,
      answered: 8,
      noSources: 2,
      outputTokens: 900,
      costUsd: 0.012345,
      unpriced: 3,
      avgLatencyMs: 1250,
    });
    expect(totalFailures(report.totals)).toBe(2);
    expect(report.daily[0]).toMatchObject({ noSources: 2, costUsd: null });
    expect(report.byModel[0]).toMatchObject({ costUsd: null, unpriced: 8, avgLatencyMs: null });
    expect(report.topUsers[0]).toMatchObject({ userId: "u1", name: "Ada", costUsd: 0.01 });
  });

  it("survives an empty or malformed result", () => {
    const report = parseUsageReport(null, 30);
    expect(report.totals).toMatchObject({ questions: 0, costUsd: null, avgLatencyMs: null });
    expect(report.daily).toEqual([]);
    expect(report.topUsers).toEqual([]);
  });

  it("accepts only 7, 30 or 90 days", () => {
    expect(parseUsagePeriod("7")).toBe(7);
    expect(parseUsagePeriod(["90"])).toBe(90);
    for (const bad of [undefined, "", "14", "abc", "0", "-7"]) {
      expect(parseUsagePeriod(bad)).toBe(30);
    }
  });

  it("never guesses a price: unknown stays 'Unknown price'", () => {
    expect(formatUsd(null)).toBe("Unknown price");
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.00123)).toBe("$0.0012");
    expect(formatUsd(12.3456)).toBe("$12.35");
    expect(costLabel(null, 4)).toBe("Unknown price");
    expect(costLabel(null, 0)).toBe("$0.00");
    expect(costLabel(0.5, 0)).toBe("$0.50");
    expect(costLabel(0.5, 3)).toBe("$0.50 + 3 at unknown price");
  });
});
