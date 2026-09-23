/**
 * Course publishing state machine (ADR-010, PRD §9).
 * Pure domain logic: no I/O, no auth. Services call `assertCourseTransition` before persisting,
 * and authorization is checked separately in the service layer.
 */

export const COURSE_STATUSES = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "archived",
  "rejected",
] as const;

export type CourseStatus = (typeof COURSE_STATUSES)[number];

export type CourseAction =
  | "submit"
  | "start_review"
  | "request_changes"
  | "approve"
  | "reject"
  | "publish"
  | "archive"
  | "reopen";

/** from-status → action → to-status. Anything not listed is illegal. */
const TRANSITIONS: Record<CourseStatus, Partial<Record<CourseAction, CourseStatus>>> = {
  draft: { submit: "submitted" },
  submitted: { start_review: "in_review" },
  in_review: { request_changes: "changes_requested", approve: "approved", reject: "rejected" },
  changes_requested: { submit: "submitted" },
  approved: { publish: "published" },
  published: { archive: "archived" },
  archived: {},
  // A rejected submission keeps its feedback/version history; the instructor may rework it as a draft.
  rejected: { reopen: "draft" },
};

export function isCourseStatus(value: unknown): value is CourseStatus {
  return typeof value === "string" && (COURSE_STATUSES as readonly string[]).includes(value);
}

export function nextCourseStatus(from: CourseStatus, action: CourseAction): CourseStatus | null {
  return TRANSITIONS[from][action] ?? null;
}

export function allowedCourseActions(from: CourseStatus): CourseAction[] {
  return Object.keys(TRANSITIONS[from]) as CourseAction[];
}

export class IllegalCourseTransitionError extends Error {
  constructor(
    readonly from: CourseStatus,
    readonly action: CourseAction,
  ) {
    super(`Cannot ${action} a course that is ${from}`);
    this.name = "IllegalCourseTransitionError";
  }
}

export function assertCourseTransition(from: CourseStatus, action: CourseAction): CourseStatus {
  const to = nextCourseStatus(from, action);
  if (!to) throw new IllegalCourseTransitionError(from, action);
  return to;
}
