// Assessment authoring rules (pure, unit-tested). The server actions run everything through here;
// the builder UI reuses the same functions for instant feedback.

export const QUESTION_TYPES = [
  { value: "mcq", label: "Multiple choice (one answer)" },
  { value: "multi", label: "Multiple select (several answers)" },
  { value: "true_false", label: "True / false" },
  { value: "short_answer", label: "Short answer" },
  { value: "essay", label: "Essay (manual grading)" },
  { value: "coding", label: "Coding (manual grading)" },
] as const;

export type AuthoringQuestionType = (typeof QUESTION_TYPES)[number]["value"];

const TYPE_SET = new Set<string>(QUESTION_TYPES.map((t) => t.value));

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const MAX_ACCEPTED_ANSWERS = 10;

export interface QuestionInput {
  type: string;
  prompt: string;
  points: number;
  options: { label: string; correct: boolean }[];
  acceptedAnswers: string[];
  explanation: string;
}

export interface NormalizedQuestion {
  type: AuthoringQuestionType;
  prompt: string;
  points: number;
  options: { label: string; correct: boolean }[];
  acceptedAnswers: string[];
  explanation: string;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

export const TRUE_FALSE_LABELS = ["True", "False"] as const;

export function validateQuestion(input: QuestionInput): Validation<NormalizedQuestion> {
  const errors: Record<string, string> = {};
  const type = input?.type;
  if (typeof type !== "string" || !TYPE_SET.has(type)) errors.type = "Choose a question type.";

  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  if (prompt === "") errors.prompt = "Write the question.";
  else if (prompt.length > 5000) errors.prompt = "Keep the question under 5000 characters.";

  const points = input?.points;
  if (typeof points !== "number" || !Number.isInteger(points) || points < 1 || points > 100) {
    errors.points = "Points must be a whole number from 1 to 100.";
  }

  const explanation = typeof input?.explanation === "string" ? input.explanation.trim() : "";
  if (explanation.length > 2000) errors.explanation = "Keep the explanation under 2000 characters.";

  let options: { label: string; correct: boolean }[] = [];
  const accepted: string[] = [];
  const rawOptions = Array.isArray(input?.options) ? input.options : [];

  if (type === "mcq" || type === "multi") {
    options = rawOptions.map((o) => ({ label: String(o?.label ?? "").trim(), correct: Boolean(o?.correct) }));
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      errors.options = `Add between ${MIN_OPTIONS} and ${MAX_OPTIONS} answer options.`;
    } else if (options.some((o) => o.label === "" || o.label.length > 1000)) {
      errors.options = "Every option needs text (up to 1000 characters).";
    } else if (new Set(options.map((o) => o.label.toLowerCase())).size !== options.length) {
      errors.options = "Answer options must be different from each other.";
    } else {
      const correct = options.filter((o) => o.correct).length;
      if (type === "mcq" && correct !== 1) errors.options = "Mark exactly one option as correct.";
      if (type === "multi" && correct < 1) errors.options = "Mark at least one option as correct.";
    }
  } else if (type === "true_false") {
    if (rawOptions.length !== 2 || rawOptions[0]?.label !== TRUE_FALSE_LABELS[0] || rawOptions[1]?.label !== TRUE_FALSE_LABELS[1]) {
      errors.options = "True/false questions need exactly the options True and False.";
    } else if (rawOptions.filter((o) => o.correct).length !== 1) {
      errors.options = "Choose whether the statement is true or false.";
    } else {
      options = rawOptions.map((o, i) => ({ label: TRUE_FALSE_LABELS[i], correct: Boolean(o.correct) }));
    }
  } else if (type === "short_answer") {
    const seen = new Set<string>();
    for (const a of Array.isArray(input?.acceptedAnswers) ? input.acceptedAnswers : []) {
      const t = String(a ?? "").trim();
      if (t === "" || seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      accepted.push(t);
    }
    if (accepted.length === 0) errors.acceptedAnswers = "Add at least one accepted answer.";
    else if (accepted.length > MAX_ACCEPTED_ANSWERS) errors.acceptedAnswers = `At most ${MAX_ACCEPTED_ANSWERS} accepted answers.`;
    else if (accepted.some((a) => a.length > 200)) errors.acceptedAnswers = "Each accepted answer must be under 200 characters.";
  }
  // essay / coding: no options, no key - graded by hand.

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      type: type as AuthoringQuestionType,
      prompt,
      points: points as number,
      options,
      acceptedAnswers: accepted,
      explanation,
    },
  };
}

export interface SettingsInput {
  title: string;
  description: string;
  passMark: number;
  maxAttempts: number | null;
  timeLimitMinutes: number | null;
}

export function validateSettings(input: SettingsInput): Validation<SettingsInput> {
  const errors: Record<string, string> = {};
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (title === "") errors.title = "Enter a title.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";

  const description = typeof input?.description === "string" ? input.description.trim() : "";
  if (description.length > 2000) errors.description = "Keep the description under 2000 characters.";

  const pass = input?.passMark;
  if (typeof pass !== "number" || !Number.isInteger(pass) || pass < 0 || pass > 100) {
    errors.passMark = "The pass mark is a whole percentage from 0 to 100.";
  }

  const attempts = input?.maxAttempts;
  if (attempts !== null && (typeof attempts !== "number" || !Number.isInteger(attempts) || attempts < 1 || attempts > 20)) {
    errors.maxAttempts = "Attempts must be 1 to 20, or unlimited.";
  }

  const limit = input?.timeLimitMinutes;
  if (limit !== null && (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 600)) {
    errors.timeLimitMinutes = "The time limit is 1 to 600 minutes, or none.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      description,
      passMark: pass as number,
      maxAttempts: attempts as number | null,
      timeLimitMinutes: limit as number | null,
    },
  };
}

/** Total points and how many are auto-graded vs need a human (for the builder summary). */
export function summarizeQuestions(questions: { type: string; points: number }[]) {
  const manual = questions.filter((q) => q.type === "essay" || q.type === "coding");
  const total = questions.reduce((n, q) => n + q.points, 0);
  const manualPoints = manual.reduce((n, q) => n + q.points, 0);
  return { count: questions.length, totalPoints: total, autoPoints: total - manualPoints, manualCount: manual.length };
}
