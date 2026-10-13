import type { SupabaseClient } from "@supabase/supabase-js";

// Read side of /admin/ai (T-204, F-704). Both reads are SQL functions that check the caller's
// permission themselves (ai_usage_report: ai.read_all; ai_tutor_access_list: ai.manage_access) and
// aggregate in the database, so message rows never reach the app.

export const USAGE_PERIODS = [7, 30, 90] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export function parseUsagePeriod(raw: string | string[] | undefined): UsagePeriod {
  const v = Number.parseInt((Array.isArray(raw) ? raw[0] : raw) ?? "", 10);
  return (USAGE_PERIODS as readonly number[]).includes(v) ? (v as UsagePeriod) : 30;
}

export interface UsageTotals {
  /** Questions learners asked (one per user message). */
  questions: number;
  /** Answers written by a model. */
  answered: number;
  /** Fixed "couldn't find this in your course" answers: no model call, no cost. */
  noSources: number;
  failed: { timeout: number; rateLimited: number; error: number; notConfigured: number };
  inputTokens: number;
  outputTokens: number;
  /** Sum over priced answers; null when no answer had a known price. */
  costUsd: number | null;
  /** Model answers whose model has no known price (cost recorded as null, never guessed). */
  unpriced: number;
  avgLatencyMs: number | null;
}

export interface UsageDay {
  day: string;
  questions: number;
  answered: number;
  noSources: number;
  failed: number;
  costUsd: number | null;
}

export interface UsageByModel {
  model: string;
  answered: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  unpriced: number;
  avgLatencyMs: number | null;
}

export interface UsageTopUser {
  userId: string;
  name: string | null;
  email: string | null;
  questions: number;
  costUsd: number | null;
}

export interface AiUsageReport {
  days: UsagePeriod;
  since: string;
  until: string;
  totals: UsageTotals;
  daily: UsageDay[];
  byModel: UsageByModel[];
  topUsers: UsageTopUser[];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : []);
const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Turns the function's JSON into typed numbers (Postgres numerics may arrive as strings). */
export function parseUsageReport(raw: unknown, days: UsagePeriod): AiUsageReport {
  const r = obj(raw);
  const t = obj(r.totals);
  return {
    days,
    since: str(r.since) ?? "",
    until: str(r.until) ?? "",
    totals: {
      questions: num(t.questions),
      answered: num(t.answered),
      noSources: num(t.no_sources),
      failed: {
        timeout: num(t.failed_timeout),
        rateLimited: num(t.failed_rate_limited),
        error: num(t.failed_error),
        notConfigured: num(t.failed_not_configured),
      },
      inputTokens: num(t.input_tokens),
      outputTokens: num(t.output_tokens),
      costUsd: numOrNull(t.cost_usd),
      unpriced: num(t.unpriced),
      avgLatencyMs: numOrNull(t.avg_latency_ms),
    },
    daily: arr(r.daily).map((d) => ({
      day: str(d.day) ?? "",
      questions: num(d.questions),
      answered: num(d.answered),
      noSources: num(d.no_sources),
      failed: num(d.failed),
      costUsd: numOrNull(d.cost_usd),
    })),
    byModel: arr(r.by_model).map((m) => ({
      model: str(m.model) ?? "unknown",
      answered: num(m.answered),
      failed: num(m.failed),
      inputTokens: num(m.input_tokens),
      outputTokens: num(m.output_tokens),
      costUsd: numOrNull(m.cost_usd),
      unpriced: num(m.unpriced),
      avgLatencyMs: numOrNull(m.avg_latency_ms),
    })),
    topUsers: arr(r.top_users).map((u) => ({
      userId: str(u.user_id) ?? "",
      name: str(u.name),
      email: str(u.email),
      questions: num(u.questions),
      costUsd: numOrNull(u.cost_usd),
    })),
  };
}

export const totalFailures = (t: UsageTotals) =>
  t.failed.timeout + t.failed.rateLimited + t.failed.error + t.failed.notConfigured;

export async function getAiUsageReport(
  supabase: SupabaseClient,
  days: UsagePeriod,
): Promise<AiUsageReport> {
  const { data, error } = await supabase.rpc("ai_usage_report", { p_days: days });
  if (error) throw new Error(`ai_usage_report failed: ${error.message}`);
  return parseUsageReport(data, days);
}

export interface AiTutorAccessEntry {
  userId: string;
  name: string | null;
  email: string | null;
  grantedAt: string;
  grantedByName: string | null;
}

export interface AiTutorAccessList {
  total: number;
  users: AiTutorAccessEntry[];
}

export const ACCESS_LIST_LIMIT = 50;

export async function listAiTutorAccess(
  supabase: SupabaseClient,
  limit = ACCESS_LIST_LIMIT,
): Promise<AiTutorAccessList> {
  const { data, error } = await supabase.rpc("ai_tutor_access_list", { p_limit: limit });
  if (error) throw new Error(`ai_tutor_access_list failed: ${error.message}`);
  const rows = (data ?? []) as {
    user_id: string;
    full_name: string | null;
    email: string | null;
    granted_at: string;
    granted_by_name: string | null;
    total: number | string;
  }[];
  return {
    total: rows.length ? num(rows[0].total) : 0,
    users: rows.map((r) => ({
      userId: r.user_id,
      name: r.full_name,
      email: r.email,
      grantedAt: r.granted_at,
      grantedByName: r.granted_by_name,
    })),
  };
}

/** "$0.0123" style, more digits for tiny amounts; null means no known price. */
export function formatUsd(value: number | null): string {
  if (value === null) return "Unknown price";
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}

/**
 * A cost with its unpriced answers called out: "$0.42", "Unknown price", or "$0.42 + 3 at unknown
 * price". A null cost with nothing unpriced is a real zero (no paid answers at all).
 */
export function costLabel(cost: number | null, unpriced: number): string {
  if (cost === null) return unpriced > 0 ? "Unknown price" : "$0.00";
  if (unpriced > 0) return `${formatUsd(cost)} + ${unpriced} at unknown price`;
  return formatUsd(cost);
}
