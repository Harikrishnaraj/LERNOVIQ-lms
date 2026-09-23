import type { SupabaseClient } from "@supabase/supabase-js";

// Learner-facing assessment shape. It is a WHITELIST: anything not mapped here (answer keys,
// explanations, correct flags) cannot reach the learner even if a table gains a new column.
// The key table (assessment_answer_keys) is also unreadable to learners via RLS (T-038).

export type QuestionType = "mcq" | "multi" | "true_false" | "short_answer" | "essay" | "coding";

export interface LearnerOption {
  id: string;
  label: string;
}

export interface LearnerQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  options: LearnerOption[];
}

export interface LearnerAssessment {
  id: string;
  title: string;
  description: string;
  passMark: number;
  maxAttempts: number | null;
  timeLimitMinutes: number | null;
  questions: LearnerQuestion[];
}

interface AssessmentRow {
  id: string;
  title: string;
  description: string;
  pass_mark: number;
  max_attempts: number | null;
  time_limit_minutes: number | null;
}
interface QuestionRow {
  id: string;
  type: QuestionType;
  prompt: string;
  points: number;
  position: number;
}
interface OptionRow {
  id: string;
  question_id: string;
  label: string;
  position: number;
}

/** Assessment content for an entitled learner, or null when not found / not accessible. */
export async function getLearnerAssessment(
  supabase: SupabaseClient,
  assessmentId: string,
): Promise<LearnerAssessment | null> {
  // Explicit column lists: never select("*") on these tables from learner code paths.
  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, title, description, pass_mark, max_attempts, time_limit_minutes")
    .eq("id", assessmentId)
    .maybeSingle();
  if (!assessment) return null;

  const { data: questions, error: qError } = await supabase
    .from("assessment_questions")
    .select("id, type, prompt, points, position")
    .eq("assessment_id", assessmentId)
    .order("position");
  if (qError) throw new Error(`questions failed: ${qError.message}`);

  const questionIds = (questions ?? []).map((q) => q.id as string);
  const { data: options, error: oError } = questionIds.length
    ? await supabase
        .from("assessment_options")
        .select("id, question_id, label, position")
        .in("question_id", questionIds)
        .order("position")
    : { data: [] as OptionRow[], error: null };
  if (oError) throw new Error(`options failed: ${oError.message}`);

  const a = assessment as AssessmentRow;
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    passMark: a.pass_mark,
    maxAttempts: a.max_attempts,
    timeLimitMinutes: a.time_limit_minutes,
    questions: ((questions ?? []) as QuestionRow[]).map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      options: ((options ?? []) as OptionRow[])
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: o.id, label: o.label })),
    })),
  };
}
