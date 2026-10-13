// AI Tutor settings rules (T-204, F-704, ADR-045): the model allow-list, the bounds of the safety
// limits and input validation. Shared by the admin form (client) and the server action, so no
// server-only imports here. The database repeats these as CHECK constraints on ai_settings.

/** Groq models an admin may choose for the tutor. Keep in step with the ai_settings CHECK. */
export const TUTOR_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;
export type TutorModel = (typeof TUTOR_MODELS)[number];

export const TUTOR_MODEL_LABELS: Record<TutorModel, string> = {
  "openai/gpt-oss-120b": "GPT-OSS 120B (stronger, default)",
  "openai/gpt-oss-20b": "GPT-OSS 20B (cheaper, faster)",
};

export const MAX_ANSWER_TOKENS = { min: 300, max: 3000 } as const;
/** The ceiling is the ai-tutor-daily rate limit (150 per 24 hours), which stays as a backstop. */
export const DAILY_QUESTION_CAP = { min: 1, max: 150 } as const;

export interface AiSettings {
  /** Global kill switch: off means the tutor refuses everyone. */
  tutorEnabled: boolean;
  /** null: the server default (AI_TUTOR_MODEL, else openai/gpt-oss-120b). */
  tutorModel: TutorModel | null;
  maxAnswerTokens: number;
  /** Questions per learner per rolling 24 hours. */
  dailyQuestionCap: number;
  /** Hint-only mode for every learner, not only during graded assessments. */
  hintOnlyAlways: boolean;
}

/** What the table holds before an admin changes anything (the behaviour before T-204). */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  tutorEnabled: true,
  tutorModel: null,
  maxAnswerTokens: 1500,
  dailyQuestionCap: 150,
  hintOnlyAlways: false,
};

export const AI_SETTING_KEYS = [
  "tutorEnabled",
  "tutorModel",
  "maxAnswerTokens",
  "dailyQuestionCap",
  "hintOnlyAlways",
] as const satisfies readonly (keyof AiSettings)[];

export const isTutorModel = (value: unknown): value is TutorModel =>
  typeof value === "string" && (TUTOR_MODELS as readonly string[]).includes(value);

const intInRange = (value: unknown, { min, max }: { min: number; max: number }) =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export type AiSettingsCheck =
  { ok: true; value: Partial<AiSettings> } | { ok: false; error: string };

/**
 * Validates a change to the settings. Every field is optional (the kill switch saves on its own),
 * but at least one must be given and unknown fields are refused.
 */
export function validateAiSettingsInput(raw: unknown): AiSettingsCheck {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Nothing to save." };
  }
  const input = raw as Record<string, unknown>;
  const unknownKey = Object.keys(input).find(
    (k) => !(AI_SETTING_KEYS as readonly string[]).includes(k),
  );
  if (unknownKey) return { ok: false, error: "Unknown setting." };

  const value: Partial<AiSettings> = {};
  if ("tutorEnabled" in input) {
    if (typeof input.tutorEnabled !== "boolean") {
      return { ok: false, error: "Choose whether the AI Tutor is on or off." };
    }
    value.tutorEnabled = input.tutorEnabled;
  }
  if ("tutorModel" in input) {
    if (input.tutorModel !== null && !isTutorModel(input.tutorModel)) {
      return { ok: false, error: "Choose one of the listed models." };
    }
    value.tutorModel = input.tutorModel;
  }
  if ("maxAnswerTokens" in input) {
    if (!intInRange(input.maxAnswerTokens, MAX_ANSWER_TOKENS)) {
      return {
        ok: false,
        error: `Answer length must be a whole number from ${MAX_ANSWER_TOKENS.min} to ${MAX_ANSWER_TOKENS.max} tokens.`,
      };
    }
    value.maxAnswerTokens = input.maxAnswerTokens as number;
  }
  if ("dailyQuestionCap" in input) {
    if (!intInRange(input.dailyQuestionCap, DAILY_QUESTION_CAP)) {
      return {
        ok: false,
        error: `The daily limit must be a whole number from ${DAILY_QUESTION_CAP.min} to ${DAILY_QUESTION_CAP.max} questions.`,
      };
    }
    value.dailyQuestionCap = input.dailyQuestionCap as number;
  }
  if ("hintOnlyAlways" in input) {
    if (typeof input.hintOnlyAlways !== "boolean") {
      return { ok: false, error: "Choose whether hint-only mode is always on." };
    }
    value.hintOnlyAlways = input.hintOnlyAlways;
  }
  if (Object.keys(value).length === 0) return { ok: false, error: "Nothing to save." };
  return { ok: true, value };
}

/** The settings fields whose value differs between two versions (for the audit entry). */
export function changedAiSettings(before: AiSettings, after: AiSettings): (keyof AiSettings)[] {
  return AI_SETTING_KEYS.filter((k) => before[k] !== after[k]);
}
