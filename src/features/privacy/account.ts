import type { SupabaseClient } from "@supabase/supabase-js";

export async function getMyDeletionStatus(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("deletion_requested_at").eq("id", userId).maybeSingle();
  return (data?.deletion_requested_at as string | null) ?? null;
}

/**
 * Every table a learner/instructor's own activity lands in, scoped to their own rows (RLS also
 * enforces this; the explicit .eq is defense in depth, matching the rest of the codebase). Scoped
 * to the account's core PII and activity record -- not every table that could ever reference a
 * user (e.g. who reviewed a course submission) -- since SECURITY.md §21 asks for "data export",
 * not a full relational graph dump.
 */
export async function getMyDataExport(supabase: SupabaseClient, userId: string) {
  const [profile, roles, enrollments, submissions, certificates, reviews, orgMemberships] = await Promise.all([
    supabase.from("profiles").select("full_name, headline, bio, avatar_url, created_at").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role_id, created_at").eq("user_id", userId),
    supabase.from("enrollments").select("course_id, status, enrolled_at, completed_at").eq("user_id", userId),
    supabase
      .from("assignment_submissions")
      .select("assignment_id, text_answer, file_name, status, is_late, submitted_at, grade, feedback")
      .eq("user_id", userId),
    supabase.from("certificates").select("code, course_title, issued_at, status").eq("user_id", userId),
    supabase.from("course_ratings").select("course_id, rating, body, instructor_reply, created_at").eq("user_id", userId),
    supabase.from("organization_members").select("organization_id, org_role, created_at").eq("user_id", userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: profile.data ?? null,
    roles: roles.data ?? [],
    enrollments: enrollments.data ?? [],
    assignmentSubmissions: submissions.data ?? [],
    certificates: certificates.data ?? [],
    courseReviews: reviews.data ?? [],
    organizationMemberships: orgMemberships.data ?? [],
  };
}

export const DELETION_GRACE_DAYS = 30;

/** Password accounts re-enter their password; accounts that sign in with a provider (e.g. Google) type their email. */
export function usesPassword(user: { app_metadata?: { providers?: string[]; provider?: string } }): boolean {
  const providers = user.app_metadata?.providers ?? (user.app_metadata?.provider ? [user.app_metadata.provider] : []);
  return providers.includes("email");
}

export function deletionDate(requestedAt: Date | string): Date {
  return new Date(new Date(requestedAt).getTime() + DELETION_GRACE_DAYS * 86_400_000);
}

const dateText = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" });

/** Plain-text notices sent after a request or a cancellation. No personal data beyond the date. */
export function deletionNotice(kind: "requested" | "cancelled", requestedAt?: Date): { subject: string; html: string } {
  if (kind === "cancelled") {
    return {
      subject: "Your Lernoviq account deletion was cancelled",
      html: "<p>Your request to delete your Lernoviq account was cancelled. Your account stays as it was.</p><p>If this was not you, change your password now.</p>",
    };
  }
  const on = dateText.format(deletionDate(requestedAt ?? new Date()));
  return {
    subject: "Your Lernoviq account is scheduled for deletion",
    html: `<p>We received a request to delete your Lernoviq account. It will be deleted on ${on} (UTC), ${DELETION_GRACE_DAYS} days after the request.</p><p>You can cancel any time before then in Settings. If this was not you, cancel it and change your password now.</p>`,
  };
}
