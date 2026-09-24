import type { Answers } from "./grading";
import type { QuestionType } from "./learner";

export interface AnswerableQuestion {
  id: string;
  type: QuestionType;
  optionIds: string[];
}

const MAX_SHORT = 500;
const MAX_LONG = 5000;

/**
 * Turns untrusted client input into a clean answers map: only real question ids, only values
 * of the right shape, option ids that exist for that question, bounded text length.
 */
export function sanitizeAnswers(questions: AnswerableQuestion[], raw: unknown): Answers {
  const out: Answers = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  const input = raw as Record<string, unknown>;

  for (const q of questions) {
    const value = input[q.id];
    if (value === undefined) continue;
    switch (q.type) {
      case "mcq":
      case "true_false":
        if (typeof value === "string" && q.optionIds.includes(value)) out[q.id] = value;
        break;
      case "multi":
        if (Array.isArray(value)) {
          const picked = [...new Set(value.filter((v): v is string => typeof v === "string"))];
          out[q.id] = picked.filter((v) => q.optionIds.includes(v));
        }
        break;
      case "short_answer":
        if (typeof value === "string") out[q.id] = value.slice(0, MAX_SHORT);
        break;
      case "essay":
      case "coding":
        if (typeof value === "string") out[q.id] = value.slice(0, MAX_LONG);
        break;
    }
  }
  return out;
}
