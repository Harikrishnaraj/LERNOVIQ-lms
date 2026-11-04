"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { createAdminClient } from "@/services/supabase/admin";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { REQUEST_KINDS, REQUEST_STATUSES, slaState, type RequestKind, type RequestStatus } from "./requests";

export type RequestResult = { ok: true; dueAt?: string } | { ok: false; error: string };

/** A signed-in person files a rights request for themselves; the deadline is one month from now. */
export async function submitSubjectRequestAction(kind: RequestKind, details: string): Promise<RequestResult> {
  if (!Object.hasOwn(REQUEST_KINDS, kind)) return { ok: false, error: "Choose what you are asking for." };
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

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * T-296 (F-449): someone without an account files a request with the email we should reply to. It
 * joins the same staff queue; identity is checked by staff before any data is released.
 */
export async function submitVisitorRequestAction(email: string, kind: RequestKind, details: string, trap = ""): Promise<RequestResult> {
  // Hidden field only bots fill in: answer as if it worked, store nothing.
  if (trap) return { ok: true };
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address) || address.length > 254) return { ok: false, error: "Enter a valid email address." };
  if (!Object.hasOwn(REQUEST_KINDS, kind)) return { ok: false, error: "Choose what you are asking for." };
  const text = details.trim();
  if (text.length > 2000) return { ok: false, error: "Please keep the details under 2000 characters." };
  if (!(await rateLimit("privacy-request", await clientIp(), address))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { data, error } = await createAdminClient()
    .from("subject_requests")
    .insert({ user_id: null, requester_email: address, kind, details: text || null })
    .select("id, due_at")
    .single();
  if (error || !data) return { ok: false, error: "We could not record your request. Please try again." };

  // No actor: the requester has no account, and the audit row holds no email (it stays on the request).
  await recordAudit({
    actorId: null,
    action: "privacy_request.created",
    resourceType: "subject_request",
    resourceId: data.id,
    metadata: { kind, visitor: true },
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

  // T-298 (F-449): completing an erasure request for an account first starts that account's deletion
  // (30-day grace, then the purge job). The request is only closed once a deletion is confirmed pending.
  let deletionStarted: string | null = null;
  if (status === "completed") {
    const { data: req } = await supabase.from("subject_requests").select("kind, user_id").eq("id", id).maybeSingle();
    if (req?.kind === "erasure" && req.user_id) {
      const admin = createAdminClient();
      const now = new Date().toISOString();
      const { error: startError } = await admin
        .from("profiles")
        .update({ deletion_requested_at: now })
        .eq("id", req.user_id)
        .is("deletion_requested_at", null);
      const { data: profile } = await admin.from("profiles").select("deletion_requested_at").eq("id", req.user_id).maybeSingle();
      if (startError || !profile?.deletion_requested_at) {
        return { ok: false, error: "We could not start the account deletion, so the request is still open." };
      }
      deletionStarted = now;
      await recordAudit({
        actorId: user.id,
        actorEmail: user.email,
        action: "privacy_request.deletion_started",
        resourceType: "subject_request",
        resourceId: id,
        metadata: { already_requested: profile.deletion_requested_at !== now },
      });
    }
  }

  const { data, error } = await supabase
    .from("subject_requests")
    .update({
      status,
      handled_by: user.id,
      resolution_note: resolution || null,
      completed_at: finished ? new Date().toISOString() : null,
      ...(deletionStarted ? { deletion_started_at: deletionStarted } : {}),
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
