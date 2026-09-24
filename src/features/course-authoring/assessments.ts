import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthoringQuestionType } from "./assessment-rules";

export interface AuthoringOption {
  id: string;
  label: string;
  correct: boolean;
}

export interface AuthoringQuestion {
  id: string;
  type: AuthoringQuestionType;
  prompt: string;
  points: number;
  position: number;
  options: AuthoringOption[];
  acceptedAnswers: string[];
  explanation: string;
}

export interface AuthoringAssessment {
  id: string;
  versionId: string;
  lessonId: string | null;
  title: string;
  description: string;
  passMark: number;
  maxAttempts: number | null;
  timeLimitMinutes: number | null;
  questions: AuthoringQuestion[];
}

export interface AssessmentSummaryRow {
  id: string;
  title: string;
  lessonId: string | null;
  lessonTitle: string | null;
  questionCount: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Assessments of a course version with their linked quiz lesson and question counts. */
export async function listAssessments(supabase: SupabaseClient, versionId: string): Promise<AssessmentSummaryRow[]> {
  const { data } = await supabase
    .from("assessments")
    .select("id, title, lesson_id, position, lessons(title), assessment_questions(id)")
    .eq("version_id", versionId)
    .order("position")
    .order("created_at");
  return (data ?? []).map((a) => ({
    id: a.id as string,
    title: a.title as string,
    lessonId: (a.lesson_id as string | null) ?? null,
    lessonTitle: (a.lessons as unknown as { title: string } | null)?.title ?? null,
    questionCount: ((a.assessment_questions as unknown as unknown[]) ?? []).length,
  }));
}

/**
 * A full assessment INCLUDING answer keys, for the owning instructor. It relies on RLS: only the
 * owner (or staff) can read assessment_answer_keys, so this returns nothing useful to anyone else.
 * Never use it on a learner path (see getLearnerAssessment).
 */
export async function getAssessmentForAuthoring(
  supabase: SupabaseClient,
  versionId: string,
  assessmentId: string,
): Promise<AuthoringAssessment | null> {
  if (!UUID.test(assessmentId)) return null;
  const { data: a } = await supabase
    .from("assessments")
    .select("id, version_id, lesson_id, title, description, pass_mark, max_attempts, time_limit_minutes")
    .eq("id", assessmentId)
    .eq("version_id", versionId)
    .maybeSingle();
  if (!a) return null;

  const { data: questions } = await supabase
    .from("assessment_questions")
    .select("id, type, prompt, points, position")
    .eq("assessment_id", assessmentId)
    .order("position");
  const ids = (questions ?? []).map((q) => q.id as string);
  const [{ data: options }, { data: keys }] = ids.length
    ? await Promise.all([
        supabase.from("assessment_options").select("id, question_id, label, position").in("question_id", ids).order("position"),
        supabase.from("assessment_answer_keys").select("question_id, correct_option_ids, accepted_answers, explanation").in("question_id", ids),
      ])
    : [{ data: [] }, { data: [] }];

  return {
    id: a.id as string,
    versionId: a.version_id as string,
    lessonId: (a.lesson_id as string | null) ?? null,
    title: a.title as string,
    description: a.description as string,
    passMark: a.pass_mark as number,
    maxAttempts: (a.max_attempts as number | null) ?? null,
    timeLimitMinutes: (a.time_limit_minutes as number | null) ?? null,
    questions: (questions ?? []).map((q) => {
      const key = (keys ?? []).find((k) => k.question_id === q.id);
      const correct = new Set((key?.correct_option_ids as string[] | undefined) ?? []);
      return {
        id: q.id as string,
        type: q.type as AuthoringQuestionType,
        prompt: q.prompt as string,
        points: q.points as number,
        position: q.position as number,
        options: (options ?? [])
          .filter((o) => o.question_id === q.id)
          .map((o) => ({ id: o.id as string, label: o.label as string, correct: correct.has(o.id as string) })),
        acceptedAnswers: (key?.accepted_answers as string[] | undefined) ?? [],
        explanation: (key?.explanation as string | undefined) ?? "",
      };
    }),
  };
}
