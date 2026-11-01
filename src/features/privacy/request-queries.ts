import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestKind, RequestStatus } from "./requests";

export interface SubjectRequestRow {
  id: string;
  requesterEmail: string;
  kind: RequestKind;
  details: string | null;
  status: RequestStatus;
  receivedAt: string;
  dueAt: string;
  completedAt: string | null;
  resolutionNote: string | null;
}

/** Open requests first (soonest deadline first), then closed ones; RLS limits this to staff. */
export async function listSubjectRequests(supabase: SupabaseClient, limit = 200): Promise<SubjectRequestRow[]> {
  const { data, error } = await supabase
    .from("subject_requests")
    .select("id, requester_email, kind, details, status, received_at, due_at, completed_at, resolution_note")
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listSubjectRequests failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    requesterEmail: r.requester_email,
    kind: r.kind,
    details: r.details,
    status: r.status,
    receivedAt: r.received_at,
    dueAt: r.due_at,
    completedAt: r.completed_at,
    resolutionNote: r.resolution_note,
  }));
}
