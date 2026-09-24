// Pure assignment rules (F-108): status for the learner, and validation of a submitted file.

import { safeFileName } from "@/features/course-authoring/uploads";

/** Types accepted for a submission. Mirrors the private bucket allow-list. */
export const SUBMISSION_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "text/plain": "txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "png",
  "image/jpeg": "jpg",
};

export const MAX_TEXT_LENGTH = 20000;

export interface AssignmentRules {
  dueAt: string | null;
  allowLate: boolean;
  allowText: boolean;
  allowFile: boolean;
  maxFileMb: number;
}

export interface SubmissionState {
  status: "submitted" | "graded";
  isLate: boolean;
}

export type AssignmentStatus =
  | "open" // nothing submitted, can submit
  | "submitted" // submitted, can still replace until the deadline
  | "graded" // locked
  | "overdue" // nothing submitted, deadline passed, no late submissions
  | "closed"; // submitted, deadline passed (locked)

/** Where the learner stands. The database enforces the same rules when submitting. */
export function assignmentStatus(a: AssignmentRules, submission: SubmissionState | null, now: Date): AssignmentStatus {
  const pastDue = a.dueAt !== null && now.getTime() > new Date(a.dueAt).getTime();
  if (submission?.status === "graded") return "graded";
  if (submission) return pastDue && !a.allowLate ? "closed" : "submitted";
  return pastDue && !a.allowLate ? "overdue" : "open";
}

/** Can the learner submit or replace right now? */
export const canSubmit = (status: AssignmentStatus) => status === "open" || status === "submitted";

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  open: "To do",
  submitted: "Submitted",
  graded: "Graded",
  overdue: "Overdue",
  closed: "Submitted (closed)",
};

export interface FileCheckInput {
  name: unknown;
  size: unknown;
  type: unknown;
}

export type FileCheck = { ok: true; ext: string; safeName: string; type: string } | { ok: false; error: string };

export function validateSubmissionFile(a: Pick<AssignmentRules, "allowFile" | "maxFileMb">, f: FileCheckInput): FileCheck {
  if (!a.allowFile) return { ok: false, error: "This assignment does not accept files." };
  if (typeof f.name !== "string" || f.name.trim() === "") return { ok: false, error: "Choose a file." };
  if (typeof f.type !== "string" || !(f.type in SUBMISSION_TYPES)) {
    return { ok: false, error: "That file type is not allowed. Use PDF, DOCX, ZIP, TXT, PNG or JPEG." };
  }
  if (typeof f.size !== "number" || !Number.isFinite(f.size) || f.size <= 0) return { ok: false, error: "The file is empty." };
  if (f.size > a.maxFileMb * 1024 * 1024) return { ok: false, error: `The file must be ${a.maxFileMb} MB or smaller.` };
  return { ok: true, ext: SUBMISSION_TYPES[f.type], safeName: safeFileName(f.name), type: f.type };
}

/** Text answer check against the assignment rules; returns an error or null. */
export function validateTextAnswer(a: Pick<AssignmentRules, "allowText">, text: string): string | null {
  const t = text.trim();
  if (t === "") return null;
  if (!a.allowText) return "This assignment does not accept a written answer.";
  if (t.length > MAX_TEXT_LENGTH) return `Keep the answer under ${MAX_TEXT_LENGTH.toLocaleString("en-US")} characters.`;
  return null;
}

/** Maps a submit_assignment result code to a message. */
export function submitErrorMessage(result: string): string {
  switch (result) {
    case "not_found":
      return "This assignment is not available.";
    case "not_enrolled":
      return "You need to be enrolled in this course to submit.";
    case "closed":
      return "The deadline has passed and late submissions are not accepted.";
    case "graded":
      return "This submission has been graded and can no longer be changed.";
    case "empty":
      return "Add a written answer or attach a file.";
    case "text_not_allowed":
      return "This assignment does not accept a written answer.";
    case "file_not_allowed":
      return "This assignment does not accept files.";
    case "file_too_large":
      return "That file is too large for this assignment.";
    default:
      return "We could not submit your work. Please try again.";
  }
}
