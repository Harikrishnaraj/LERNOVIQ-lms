"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateQuestion, type QuestionInput } from "@/features/course-authoring/assessment-rules";
import { getAssessmentForAuthoring } from "@/features/course-authoring/assessments";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { MAX_IMPORT, getBankItems, parseTags } from "./bank";

export type BankResult =
  | { ok: true; id?: string; imported?: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DENIED = { ok: false, error: "That question is not available." } as const;
const FAILED = { ok: false, error: "We could not save that change. Please try again." } as const;

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function values(input: QuestionInput, tags: string[]) {
  const parsed = validateQuestion(input);
  if (!parsed.ok) return parsed;
  const q = parsed.value;
  return {
    ok: true as const,
    row: { type: q.type, prompt: q.prompt, points: q.points, options: q.options, accepted_answers: q.acceptedAnswers, explanation: q.explanation, tags },
  };
}

/** Creates (id null) or updates a bank item. The same validation as assessment questions applies. */
export async function saveBankItem(id: string | null, input: QuestionInput, tags: string): Promise<BankResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  const t = parseTags(tags);
  if (!t.ok) return { ok: false, error: t.error, fieldErrors: { tags: t.error } };
  const v = values(input, t.tags);
  if (!v.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: v.errors };

  if (id === null) {
    const { data, error } = await supabase.from("question_bank_items").insert({ owner_id: user.id, ...v.row }).select("id").single();
    if (error || !data) return FAILED;
    revalidatePath("/instructor/question-bank");
    return { ok: true, id: data.id as string };
  }
  if (!UUID.test(id)) return DENIED;
  const { data, error } = await supabase.from("question_bank_items").update(v.row).eq("id", id).eq("owner_id", user.id).select("id");
  if (error) return FAILED;
  if (!data?.length) return DENIED;
  revalidatePath("/instructor/question-bank");
  return { ok: true, id };
}

export async function deleteBankItem(id: string): Promise<BankResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(id)) return DENIED;
  const { data, error } = await supabase.from("question_bank_items").delete().eq("id", id).eq("owner_id", user.id).select("id");
  if (error) return FAILED;
  if (!data?.length) return DENIED;
  revalidatePath("/instructor/question-bank");
  return { ok: true };
}

/** Copies an assessment question (with its key) into the bank. */
export async function saveQuestionToBank(courseId: string, assessmentId: string, questionId: string, tags: string): Promise<BankResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return DENIED;
  const assessment = await getAssessmentForAuthoring(supabase, course.version.id, assessmentId);
  const q = assessment?.questions.find((x) => x.id === questionId);
  if (!q) return DENIED;
  return saveBankItem(
    null,
    { type: q.type, prompt: q.prompt, points: q.points, options: q.options.map((o) => ({ label: o.label, correct: o.correct })), acceptedAnswers: q.acceptedAnswers, explanation: q.explanation },
    tags,
  );
}

/**
 * Imports bank items into an assessment as independent copies, through the same atomic RPC the
 * builder uses (so RLS and the editable-version rule apply). Stops at the first failure.
 */
export async function importFromBank(courseId: string, assessmentId: string, itemIds: string[]): Promise<BankResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  const ids = [...new Set(itemIds)].filter((i) => UUID.test(i));
  if (ids.length === 0) return { ok: false, error: "Choose at least one question." };
  if (ids.length > MAX_IMPORT) return { ok: false, error: `Import at most ${MAX_IMPORT} questions at a time.` };

  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return DENIED;
  if (!course.editable) return { ok: false, error: "This course is locked while it is in review or published." };
  if (!UUID.test(assessmentId)) return DENIED;
  const { data: own } = await supabase.from("assessments").select("id").eq("id", assessmentId).eq("version_id", course.version.id).maybeSingle();
  if (!own) return DENIED;

  // Keep the order the caller chose; only the caller own items are returned by RLS.
  const found = new Map((await getBankItems(supabase, ids)).map((i) => [i.id, i]));
  let imported = 0;
  for (const id of ids) {
    const item = found.get(id);
    if (!item) continue;
    const { error } = await supabase.rpc("save_assessment_question", {
      p_assessment_id: assessmentId,
      p_question_id: null,
      p_type: item.type,
      p_prompt: item.prompt,
      p_points: item.points,
      p_options: item.options,
      p_accepted: item.acceptedAnswers,
      p_explanation: item.explanation,
    });
    if (error) return { ok: false, error: imported > 0 ? `Imported ${imported} before a problem occurred.` : "We could not import those questions." };
    imported++;
  }
  if (imported === 0) return DENIED;
  revalidatePath(`/instructor/courses/${courseId}/assessments`, "layout");
  return { ok: true, imported };
}
