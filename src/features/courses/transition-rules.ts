import type { CourseAction } from "./course-status";
import type { AuditAction } from "@/services/audit";

// Pure metadata for reviewer decisions (F-406). The state machine itself is course-status.ts.

export const ACTION_LABEL: Record<CourseAction, string> = {
  submit: "Submit",
  start_review: "Start review",
  request_changes: "Request changes",
  approve: "Approve",
  reject: "Reject",
  publish: "Publish",
  archive: "Archive",
  reopen: "Reopen as draft",
};

export const AUDIT_FOR_ACTION: Partial<Record<CourseAction, AuditAction>> = {
  start_review: "course.review_started",
  request_changes: "course.changes_requested",
  approve: "course.approved",
  reject: "course.rejected",
  publish: "course.published",
  archive: "course.archived",
  reopen: "course.reopened",
};

/** Actions a reviewer takes (submit belongs to the instructor). */
export const REVIEWER_ACTIONS = [
  "start_review",
  "request_changes",
  "approve",
  "reject",
  "publish",
  "archive",
  "reopen",
] as const satisfies readonly CourseAction[];

export type ReviewerAction = (typeof REVIEWER_ACTIONS)[number];

/** Safe to apply to many courses at once without reading each one. */
export const BULK_ACTIONS = ["start_review", "archive"] as const satisfies readonly ReviewerAction[];

export const MAX_REVIEW_NOTE = 4000;
export const MIN_DECISION_NOTE = 3;

/** Sending a course back or refusing it must explain why. */
export const NOTE_REQUIRED: ReadonlySet<CourseAction> = new Set(["request_changes", "reject"]);

export function isReviewerAction(value: unknown): value is ReviewerAction {
  return typeof value === "string" && (REVIEWER_ACTIONS as readonly string[]).includes(value);
}

/** Returns an error message, or null when the note is acceptable for the action. */
export function validateDecisionNote(action: CourseAction, note: string): string | null {
  const text = note.trim();
  if (text.length > MAX_REVIEW_NOTE) return `Keep the note under ${MAX_REVIEW_NOTE} characters.`;
  if (NOTE_REQUIRED.has(action) && text.length < MIN_DECISION_NOTE) {
    return "Tell the instructor why: add a short note.";
  }
  return null;
}
