"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { REQUEST_KINDS, REQUEST_STATUSES, slaState, type RequestKind, type RequestStatus } from "./requests";

export type RequestResult = { ok: true; dueAt?: string } | { ok: false; error: string };

/** A signed-in person files a rights request for themselves; the deadline is one month from now. */
export async function submitSubjectRequestAction(kind: RequestKind, details: string): Promise<RequestResult> {
  if (!(kind in REQUEST_KINDS)) return { ok: false, error: "Choose what you are asking for." };
  const text = details.trim();
  if (text.length > 2000) return { ok: false, error: "Please keep the details under 2000 characters." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("account-privacy", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { data, error } = await supabase
    .from("subject_requests")
    .insert({ user_id: user.id, requester_email: user.email, kind, details: text || null })
    .select("id, due_at")
    .single();
  if (error || !data) return { ok: false, error: "We could not record your request. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "privacy_request.created",
    resourceType: "subject_request",
    resourceId: data.id,
    metadata: { kind },
  });
  return { ok: true, dueAt: data.due_at };
}

/** Staff move a request along; finishing one needs a note saying what was done (or why it was refused). */
export async function updateSubjectRequestAction(id: string, status: RequestStatus, note: string): Promise<RequestResult> {
  if (!REQUEST_STATUSES.includes(status) || status === "open") return { ok: false, error: "Choose a valid status." };
  const resolution = note.trim();
  const finished = status === "completed" || status === "rejected";
  if (finished && !resolution) return { ok: false, error: "Add a note saying what was done." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "privacy.requests"))) return { ok: false, error: "You cannot handle privacy requests." };

  const { data, error } = await supabase
    .from("subject_requests")
    .update({
      status,
      handled_by: user.id,
      resolution_note: resolution || null,
      completed_at: finished ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .not("status", "in", "(completed,rejected)")
    .select("kind, due_at")
    .maybeSingle();
  if (error) return { ok: false, error: "We could not update the request." };
  if (!data) return { ok: false, error: "That request is already closed or no longer exists." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "privacy_request.updated",
    resourceType: "subject_request",
    resourceId: id,
    metadata: { kind: data.kind, status, late: finished && slaState(data.due_at, "open").overdue },
  });
  revalidatePath("/admin/privacy-requests");
  return { ok: true };
}
