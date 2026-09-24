import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_ACTIONS } from "@/services/audit";

export interface AuditRow {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditQuery {
  action: string;
  actor: string;
  resourceType: string;
  resourceId: string;
  from: string;
  to: string;
  page: number;
}

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_LIMIT = 5000;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export function parseAuditQuery(params: Params): AuditQuery {
  const action = one(params.action);
  const page = Number.parseInt(one(params.page), 10);
  const from = one(params.from);
  const to = one(params.to);
  return {
    action: (AUDIT_ACTIONS as readonly string[]).includes(action) ? action : "",
    actor: one(params.actor).trim().slice(0, 100),
    resourceType: one(params.resourceType).trim().slice(0, 100),
    resourceId: one(params.resourceId).trim().slice(0, 100),
    from: validDate(from) ? from : "",
    to: validDate(to) ? to : "",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

/** Escapes LIKE wildcards so a search is always a literal substring. */
export const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

interface Row {
  id: string;
  created_at: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
}

const toRow = (r: Row): AuditRow => ({
  id: r.id,
  createdAt: r.created_at,
  actorId: r.actor_id,
  actorEmail: r.actor_email,
  action: r.action,
  resourceType: r.resource_type,
  resourceId: r.resource_id,
  metadata: r.metadata ?? {},
});

interface FilterQuery {
  eq(column: string, value: string): FilterQuery;
  ilike(column: string, pattern: string): FilterQuery;
  gte(column: string, value: string): FilterQuery;
  lte(column: string, value: string): FilterQuery;
}

/** Adds the active filters to a PostgREST builder (typed structurally to avoid deep generics). */
function applyFilters<T>(query: T, f: AuditQuery): T {
  let out = query as unknown as FilterQuery;
  if (f.action) out = out.eq("action", f.action);
  if (f.actor) out = out.ilike("actor_email", likePattern(f.actor));
  if (f.resourceType) out = out.eq("resource_type", f.resourceType);
  if (f.resourceId) out = out.eq("resource_id", f.resourceId);
  if (f.from) out = out.gte("created_at", `${f.from}T00:00:00.000Z`);
  if (f.to) out = out.lte("created_at", `${f.to}T23:59:59.999Z`);
  return out as unknown as T;
}

/** One page of the audit log, newest first. RLS returns nothing without audit.read. */
export async function getAuditPage(supabase: SupabaseClient, f: AuditQuery): Promise<{ rows: AuditRow[]; total: number }> {
  const start = (f.page - 1) * AUDIT_PAGE_SIZE;
  const q = applyFilters(
    supabase.from("audit_logs").select("id, created_at, actor_id, actor_email, action, resource_type, resource_id, metadata", { count: "exact" }),
    f,
  )
    .order("created_at", { ascending: false })
    .order("id")
    .range(start, start + AUDIT_PAGE_SIZE - 1);
  const { data, count, error } = await q;
  if (error?.code === "PGRST103") {
    // A page past the end (an old bookmark): no rows, but still report the real total.
    const head = await applyFilters(supabase.from("audit_logs").select("id", { count: "exact", head: true }), f);
    return { rows: [], total: head.count ?? 0 };
  }
  if (error) throw new Error(`audit page failed: ${error.message}`);
  return { rows: ((data ?? []) as Row[]).map(toRow), total: count ?? 0 };
}

/** Up to AUDIT_EXPORT_LIMIT rows matching the filters (ignores paging). */
export async function getAuditExport(supabase: SupabaseClient, f: AuditQuery): Promise<AuditRow[]> {
  const q = applyFilters(
    supabase.from("audit_logs").select("id, created_at, actor_id, actor_email, action, resource_type, resource_id, metadata"),
    f,
  )
    .order("created_at", { ascending: false })
    .order("id")
    .limit(AUDIT_EXPORT_LIMIT);
  const { data, error } = await q;
  if (error) throw new Error(`audit export failed: ${error.message}`);
  return ((data ?? []) as Row[]).map(toRow);
}

/** A CSV cell: quoted, quotes doubled, and neutralised against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function auditToCsv(rows: AuditRow[]): string {
  const header = ["time", "actor_email", "actor_id", "action", "resource_type", "resource_id", "metadata"];
  const lines = rows.map((r) =>
    [r.createdAt, r.actorEmail, r.actorId, r.action, r.resourceType, r.resourceId, r.metadata].map(csvCell).join(","),
  );
  return [header.map(csvCell).join(","), ...lines].join("\r\n") + "\r\n";
}
