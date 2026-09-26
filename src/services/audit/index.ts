import { createAdminClient } from "@/services/supabase/admin";

/** Privileged actions that must leave a trail (SECURITY section 17). Add new ones here. */
export const AUDIT_ACTIONS = [
  "course.submitted",
  "course.review_started",
  "course.version_created",
  "course.reopened",
  "course.changes_requested",
  "course.approved",
  "course.rejected",
  "course.published",
  "course.archived",
  "user.role_changed",
  "user.suspended",
  "user.reinstated",
  "user.invited",
  "user.created",
  "instructor.application_approved",
  "instructor.application_rejected",
  "role_permission_changed",
  "category.created",
  "category.updated",
  "category.deleted",
  "enrollment.manual_enroll",
  "enrollment.manual_unenroll",
  "enrollment.bulk_enroll",
  "certificate.revoked",
  "assessment.attempt_reset",
  "certificate.reissued",
  "content.resource_deleted",
  "content.scorm_package_deleted",
  "moderation.content_hidden",
  "moderation.content_restored",
  "moderation.report_dismissed",
  "auth.login_failed",
  "settings.changed",
  "audit.exported",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  actorId: string | null;
  actorEmail?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends one row to the append-only audit log. Server-only (service role). It never throws: a
 * failing audit write must not undo an action that already happened, but it is logged loudly and
 * reported to the caller so critical paths can decide what to do.
 */
export async function recordAudit(entry: AuditEntry): Promise<boolean> {
  try {
    const { error } = await createAdminClient()
      .from("audit_logs")
      .insert({
        actor_id: entry.actorId,
        actor_email: entry.actorEmail ?? null,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId ?? null,
        metadata: entry.metadata ?? {},
      });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error("audit write failed", entry.action, err);
    return false;
  }
}
