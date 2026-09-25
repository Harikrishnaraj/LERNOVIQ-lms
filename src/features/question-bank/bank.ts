import type { SupabaseClient } from "@supabase/supabase-js";
import { QUESTION_TYPES, type AuthoringQuestionType } from "@/features/course-authoring/assessment-rules";
import type { AuthoringQuestion } from "@/features/course-authoring/assessments";

export interface BankItem {
  id: string;
  type: AuthoringQuestionType;
  prompt: string;
  points: number;
  options: { label: string; correct: boolean }[];
  acceptedAnswers: string[];
  explanation: string;
  tags: string[];
  updatedAt: string;
}

export const MAX_IMPORT = 50;
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 30;

/** Lowercase, trimmed, deduplicated tags; anything over the limits is reported. */
export function parseTags(input: string | string[]): { ok: true; tags: string[] } | { ok: false; error: string } {
  const raw = Array.isArray(input) ? input : input.split(/[,\n]/);
  const tags: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase().replace(/\s+/g, "-");
    if (tag === "" || tags.includes(tag)) continue;
    if (tag.length > MAX_TAG_LENGTH) return { ok: false, error: `Keep each tag under ${MAX_TAG_LENGTH} characters.` };
    if (!/^[a-z0-9][a-z0-9+#.-]*$/.test(tag)) return { ok: false, error: "Tags may use letters, numbers, dashes, dots, + and #." };
    tags.push(tag);
  }
  if (tags.length > MAX_TAGS) return { ok: false, error: `Use at most ${MAX_TAGS} tags.` };
  return { ok: true, tags };
}

export interface BankQuery {
  q: string;
  tag: string;
  type: AuthoringQuestionType | "";
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseBankQuery(params: Params): BankQuery {
  const type = one(params.type);
  return {
    q: one(params.q).trim().slice(0, 100),
    tag: one(params.tag).trim().toLowerCase().slice(0, MAX_TAG_LENGTH),
    type: QUESTION_TYPES.some((t) => t.value === type) ? (type as AuthoringQuestionType) : "",
  };
}

interface Row {
  id: string;
  type: string;
  prompt: string;
  points: number;
  options: { label: string; correct: boolean }[] | null;
  accepted_answers: string[];
  explanation: string;
  tags: string[];
  updated_at: string;
}

const toItem = (r: Row): BankItem => ({
  id: r.id,
  type: r.type as AuthoringQuestionType,
  prompt: r.prompt,
  points: r.points,
  options: r.options ?? [],
  acceptedAnswers: r.accepted_answers,
  explanation: r.explanation,
  tags: r.tags,
  updatedAt: r.updated_at,
});

const SELECT = "id, type, prompt, points, options, accepted_answers, explanation, tags, updated_at";

/** The caller own bank items (RLS), newest first, filtered by text, tag and type. */
export async function listBankItems(supabase: SupabaseClient, query: BankQuery): Promise<BankItem[]> {
  let q = supabase.from("question_bank_items").select(SELECT).order("updated_at", { ascending: false }).limit(500);
  if (query.type) q = q.eq("type", query.type);
  if (query.tag) q = q.contains("tags", [query.tag]);
  if (query.q) q = q.ilike("prompt", `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await q;
  if (error) throw new Error(`question bank failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(toItem);
}

/** Every tag in use, with counts, for the filter. */
export async function listBankTags(supabase: SupabaseClient): Promise<{ tag: string; count: number }[]> {
  const { data } = await supabase.from("question_bank_items").select("tags").limit(1000);
  const counts = new Map<string, number>();
  for (const r of data ?? []) for (const t of (r.tags as string[]) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function getBankItems(supabase: SupabaseClient, ids: string[]): Promise<BankItem[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("question_bank_items").select(SELECT).in("id", ids);
  if (error) throw new Error(`question bank failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(toItem);
}

/** A bank item in the shape the question editor expects (ids are placeholders). */
export function toEditorQuestion(item: BankItem): AuthoringQuestion {
  return {
    id: item.id,
    type: item.type,
    prompt: item.prompt,
    points: item.points,
    position: 0,
    options: item.options.map((o, i) => ({ id: `${item.id}-${i}`, label: o.label, correct: o.correct })),
    acceptedAnswers: item.acceptedAnswers,
    explanation: item.explanation,
  };
}
