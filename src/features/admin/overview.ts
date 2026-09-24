import type { SupabaseClient } from "@supabase/supabase-js";

export interface AdminOverview {
  usersTotal: number;
  usersNew7d: number;
  usersSuspended: number;
  instructors: number;
  coursesPublished: number;
  coursesPendingReview: number;
  coursesChangesRequested: number;
  enrollmentsTotal: number;
  enrollments7d: number;
  completionsTotal: number;
  certificatesIssued: number;
}

export interface PendingReview {
  courseId: string;
  title: string;
  status: "submitted" | "in_review";
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  action: string;
  actorEmail: string | null;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
}

/** Platform counts (no personal data). The RPC itself refuses callers without portal.admin.access. */
export async function getAdminOverview(supabase: SupabaseClient): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error || !data) throw new Error(`admin_overview failed: ${error?.message}`);
  const n = (k: string) => Number((data as Record<string, unknown>)[k] ?? 0);
  return {
    usersTotal: n("users_total"),
    usersNew7d: n("users_new_7d"),
    usersSuspended: n("users_suspended"),
    instructors: n("instructors"),
    coursesPublished: n("courses_published"),
    coursesPendingReview: n("courses_pending_review"),
    coursesChangesRequested: n("courses_changes_requested"),
    enrollmentsTotal: n("enrollments_total"),
    enrollments7d: n("enrollments_7d"),
    completionsTotal: n("completions_total"),
    certificatesIssued: n("certificates_issued"),
  };
}

/** Oldest submissions first: the queue a reviewer works through. RLS (course.read_all) applies. */
export async function getPendingReviews(supabase: SupabaseClient, limit = 5): Promise<PendingReview[]> {
  const { data, error } = await supabase
    .from("course_versions")
    .select("course_id, title, status, updated_at")
    .in("status", ["submitted", "in_review"])
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`pending reviews failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    courseId: r.course_id as string,
    title: r.title as string,
    status: r.status as PendingReview["status"],
    updatedAt: r.updated_at as string,
  }));
}

/** Latest audit events. Returns [] for callers without audit.read (RLS). */
export async function getRecentActivity(supabase: SupabaseClient, limit = 8): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, actor_email, resource_type, resource_id, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recent activity failed: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    action: r.action as string,
    actorEmail: (r.actor_email as string | null) ?? null,
    resourceType: r.resource_type as string,
    resourceId: (r.resource_id as string | null) ?? null,
    createdAt: r.created_at as string,
  }));
}

/** "course.changes_requested" -> "Course changes requested". */
export function describeAction(action: string): string {
  const text = action.replace(/[._]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
