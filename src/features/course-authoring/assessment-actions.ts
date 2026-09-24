"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  validateQuestion,
  validateSettings,
  type QuestionInput,
  type SettingsInput,
} from "./assessment-rules";
import { isPermutation } from "./ordering";
import { getCourseForEditing } from "./queries";

export type AssessmentResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = { ok: false, error: "This assessment is not available." } as const;
const LOCKED = { ok: false, error: "This course is locked while it is in review or published." } as const;
const FAILED = { ok: false, error: "We could not save that change. Please try again." } as const;

type Db = Awaited<ReturnType<typeof createClient>>;
type Ctx =
  | { ok: true; supabase: Db; courseId: string; versionId: string }
  | { ok: false; result: { ok: false; error: string } };

// authenticate -> own course -> newest version editable. RLS (can_edit_version) backs it up.
async function authorize(courseId: string): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, result: { ok: false, error: "Please log in again." } };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, result: DENIED };
  if (!course.editable) return { ok: false, result: LOCKED };
  return { ok: true, supabase, courseId: course.courseId, versionId: course.version.id };
}

async function ownAssessment(db: Db, versionId: string, assessmentId: string) {
  if (typeof assessmentId !== "string" || !UUID.test(assessmentId)) return false;
  const { data } = await db.from("assessments").select("id").eq("id", assessmentId).eq("version_id", versionId).maybeSingle();
  return Boolean(data);
}

const done = (courseId: string, id?: string): AssessmentResult => {
  revalidatePath(`/instructor/courses/${courseId}/assessments`, "layout");
  revalidatePath(`/instructor/courses/${courseId}/curriculum`);
  return { ok: true, id };
};

/** Creates an assessment (optionally attached to a quiz lesson of the same version). */
export async function createAssessment(
  courseId: string,
  input: { title: string; lessonId?: string | null },
): Promise<AssessmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  if (title === "" || title.length > 200) return { ok: false, error: "Enter a title up to 200 characters.", fieldErrors: { title: "Enter a title up to 200 characters." } };

  let lessonId: string | null = null;
  if (input.lessonId) {
    if (!UUID.test(input.lessonId)) return DENIED;
    const { data: lesson } = await ctx.supabase
      .from("lessons")
      .select("id, type, course_sections!inner(version_id)")
      .eq("id", input.lessonId)
      .eq("course_sections.version_id", ctx.versionId)
      .maybeSingle();
    if (!lesson) return DENIED;
    if (lesson.type !== "quiz") return { ok: false, error: "Only quiz lessons can have an assessment." };
    lessonId = lesson.id as string;
  }

  const { data: existing } = await ctx.supabase.from("assessments").select("position").eq("version_id", ctx.versionId);
  const position = (existing ?? []).reduce((m, a) => Math.max(m, (a.position as number) + 1), 0);
  const { data, error } = await ctx.supabase
    .from("assessments")
    .insert({ version_id: ctx.versionId, lesson_id: lessonId, title, position })
    .select("id")
    .single();
  if (error) {
    return error.code === "23505" ? { ok: false, error: "That quiz lesson already has an assessment." } : FAILED;
  }
  return done(ctx.courseId, data.id as string);
}

export async function updateAssessmentSettings(courseId: string, assessmentId: string, input: SettingsInput): Promise<AssessmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownAssessment(ctx.supabase, ctx.versionId, assessmentId))) return DENIED;
  const parsed = validateSettings(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };

  const { data, error } = await ctx.supabase
    .from("assessments")
    .update({
      title: parsed.value.title,
      description: parsed.value.description,
      pass_mark: parsed.value.passMark,
      max_attempts: parsed.value.maxAttempts,
      time_limit_minutes: parsed.value.timeLimitMinutes,
    })
    .eq("id", assessmentId)
    .select("id");
  return error || !data?.length ? FAILED : done(ctx.courseId);
}

export async function deleteAssessment(courseId: string, assessmentId: string): Promise<AssessmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownAssessment(ctx.supabase, ctx.versionId, assessmentId))) return DENIED;
  const { error } = await ctx.supabase.from("assessments").delete().eq("id", assessmentId);
  return error ? FAILED : done(ctx.courseId);
}

/** Creates (questionId = null) or updates a question with its options and answer key atomically. */
export async function saveQuestion(
  courseId: string,
  assessmentId: string,
  questionId: string | null,
  input: QuestionInput,
): Promise<AssessmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownAssessment(ctx.supabase, ctx.versionId, assessmentId))) return DENIED;
  if (questionId !== null && (typeof questionId !== "string" || !UUID.test(questionId))) return DENIED;
  const parsed = validateQuestion(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };

  const q = parsed.value;
  const { data, error } = await ctx.supabase.rpc("save_assessment_question", {
    p_assessment_id: assessmentId,
    p_question_id: questionId,
    p_type: q.type,
    p_prompt: q.prompt,
    p_points: q.points,
    p_options: q.options,
    p_accepted: q.acceptedAnswers,
    p_explanation: q.explanation,
  });
  if (error) return error.code === "42501" ? DENIED : FAILED;
  return done(ctx.courseId, data as string);
}

export async function deleteQuestion(courseId: string, assessmentId: string, questionId: string): Promise<AssessmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownAssessment(ctx.supabase, ctx.versionId, assessmentId))) return DENIED;
  if (typeof questionId !== "string" || !UUID.test(questionId)) return DENIED;

  const { data, error } = await ctx.supabase
    .from("assessment_questions")
    .delete()
    .eq("id", questionId)
    .eq("assessment_id", assessmentId)
    .select("id");
  if (error) return FAILED;
  if (!data?.length) return DENIED;
  const rest = await ctx.supabase.from("assessment_questions").select("id").eq("assessment_id", assessmentId).order("position");
  await Promise.all((rest.data ?? []).map((r, position) => ctx.supabase.from("assessment_questions").update({ position }).eq("id", r.id)));
  return done(ctx.courseId);
}

export async function reorderQuestions(courseId: string, assessmentId: string, orderedIds: string[]): Promise<AssessmentResult> {
  const ctx = await authorize(courseId);
  if (!ctx.ok) return ctx.result;
  if (!(await ownAssessment(ctx.supabase, ctx.versionId, assessmentId))) return DENIED;
  const { data } = await ctx.supabase.from("assessment_questions").select("id").eq("assessment_id", assessmentId).order("position");
  const current = (data ?? []).map((r) => r.id as string);
  if (!Array.isArray(orderedIds) || !isPermutation(current, orderedIds)) {
    return { ok: false, error: "The questions changed elsewhere. Refresh and try again." };
  }
  const results = await Promise.all(orderedIds.map((id, position) => ctx.supabase.from("assessment_questions").update({ position }).eq("id", id)));
  return results.every((r) => !r.error) ? done(ctx.courseId) : FAILED;
}
