import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { DEFAULT_AI_SETTINGS, isTutorModel, type AiSettings } from "./settings-rules";

// Reads the platform AI Tutor settings (T-204, ADR-045). Uncached on purpose: the tutor reads
// them once per question, so a kill switch or a lower cap takes effect on the next question.

export interface AiSettingsRow {
  tutor_enabled: boolean;
  tutor_model: string | null;
  max_answer_tokens: number;
  daily_question_cap: number;
  hint_only_always: boolean;
  updated_at?: string;
  updated_by?: string | null;
}

export const AI_SETTINGS_COLUMNS =
  "tutor_enabled, tutor_model, max_answer_tokens, daily_question_cap, hint_only_always, updated_at, updated_by";

export function toAiSettings(row: AiSettingsRow): AiSettings {
  return {
    tutorEnabled: row.tutor_enabled === true,
    tutorModel: isTutorModel(row.tutor_model) ? row.tutor_model : null,
    maxAnswerTokens: row.max_answer_tokens,
    dailyQuestionCap: row.daily_question_cap,
    hintOnlyAlways: row.hint_only_always === true,
  };
}

export function toAiSettingsRow(settings: Partial<AiSettings>): Partial<AiSettingsRow> {
  const row: Partial<AiSettingsRow> = {};
  if (settings.tutorEnabled !== undefined) row.tutor_enabled = settings.tutorEnabled;
  if (settings.tutorModel !== undefined) row.tutor_model = settings.tutorModel;
  if (settings.maxAnswerTokens !== undefined) row.max_answer_tokens = settings.maxAnswerTokens;
  if (settings.dailyQuestionCap !== undefined) row.daily_question_cap = settings.dailyQuestionCap;
  if (settings.hintOnlyAlways !== undefined) row.hint_only_always = settings.hintOnlyAlways;
  return row;
}

/**
 * The settings row, or null when it cannot be read. Callers fail closed on null: the tutor refuses
 * to answer rather than run with limits it could not check. A missing row means the defaults.
 */
export async function getAiSettings(client: SupabaseClient): Promise<AiSettings | null> {
  const { data, error } = await client
    .from("ai_settings")
    .select(AI_SETTINGS_COLUMNS)
    .eq("id", true)
    .maybeSingle();
  if (error) {
    log.error("ai.settings.read_failed", { message: error.message });
    return null;
  }
  return data ? toAiSettings(data as AiSettingsRow) : { ...DEFAULT_AI_SETTINGS };
}
