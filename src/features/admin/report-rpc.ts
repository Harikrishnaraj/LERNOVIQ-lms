import type { SupabaseClient } from "@supabase/supabase-js";

/** Every report RPC ends in `limit 10000`; a result this long may be cut off. */
export const REPORT_ROW_LIMIT = 10_000;

/** PostgREST caps each response at `max_rows` (1000 on Supabase), so reports read in pages of this size. */
export const PAGE_SIZE = 1000;

/** Rows from a set-returning report RPC, past the API's 1000-row cap. The RPCs order their output, so pages do not overlap. */
export async function rpcAllRows<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < REPORT_ROW_LIMIT; from += PAGE_SIZE) {
    const { data, error } = await supabase.rpc(fn, args).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${fn} failed: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}
