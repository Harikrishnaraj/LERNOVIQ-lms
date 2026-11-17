import type { SupabaseClient } from "@supabase/supabase-js";
import { slaState, type RequestStatus } from "./requests";

// T-297 (F-449): remind the staff who handle privacy requests 7 days before the one-month deadline,
// and again once it has passed. Each stage is sent once per request.
export type ReminderStage = "due_soon" | "overdue";

export function reminderStage(
  r: { due_at: string; status: RequestStatus; reminded_due_soon_at: string | null; reminded_overdue_at: string | null },
  now = new Date(),
): ReminderStage | null {
  const sla = slaState(r.due_at, r.status, now);
  if (sla.overdue) return r.reminded_overdue_at ? null : "overdue";
  if (sla.dueSoon) return r.reminded_due_soon_at ? null : "due_soon";
  return null;
}

export async function sendRequestReminders(
  admin: SupabaseClient,
  notify: (n: { userId: string; title: string; body: string; href: string }) => Promise<boolean>,
  now = new Date(),
): Promise<{ reminded: number }> {
  const { data: requests, error } = await admin
    .from("subject_requests")
    .select("id, kind, due_at, status, reminded_due_soon_at, reminded_overdue_at")
    .in("status", ["open", "in_progress"]);
  if (error) throw new Error(`subject_requests query failed: ${error.message}`);

  const due = (requests ?? []).flatMap((r) => {
    const stage = reminderStage(r, now);
    return stage ? [{ ...r, stage }] : [];
  });
  if (due.length === 0) return { reminded: 0 };

  const { data: roles, error: rolesError } = await admin.from("role_permissions").select("role_id").eq("permission_id", "privacy.requests");
  if (rolesError) throw new Error(`role_permissions query failed: ${rolesError.message}`);
  const { data: staff, error: staffError } = await admin
    .from("user_roles")
    .select("user_id")
    .in("role_id", (roles ?? []).map((r) => r.role_id as string));
  if (staffError) throw new Error(`user_roles query failed: ${staffError.message}`);
  const staffIds = [...new Set((staff ?? []).map((s) => s.user_id as string))];
  // Nobody to tell: leave every request unstamped so the reminder goes out once staff exist.
  if (staffIds.length === 0) return { reminded: 0 };

  let reminded = 0;

  for (const r of due) {
    const days = Math.abs(slaState(r.due_at, r.status as RequestStatus, now).daysLeft);
    const title = r.stage === "overdue" ? "Privacy request overdue" : "Privacy request due soon";
    const body =
      r.stage === "overdue"
        ? `A ${r.kind} request is ${days} day${days === 1 ? "" : "s"} past its one-month deadline.`
        : `A ${r.kind} request is due in ${days} day${days === 1 ? "" : "s"}.`;
    const sent = await Promise.all(staffIds.map((userId) => notify({ userId, title, body, href: "/admin/privacy-requests" })));
    // Stamped only once at least one person was told; otherwise the next run tries again.
    if (!sent.some(Boolean)) continue;
    reminded++;
    await admin
      .from("subject_requests")
      .update(r.stage === "overdue" ? { reminded_overdue_at: now.toISOString() } : { reminded_due_soon_at: now.toISOString() })
      .eq("id", r.id);
  }
  return { reminded };
}
