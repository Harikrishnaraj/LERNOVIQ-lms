/** F-444 (T-286): subject-rights request kinds and the one-month deadline, shared by UI and actions. */
export const REQUEST_KINDS = {
  access: "Access to my data",
  rectification: "Correct my data",
  erasure: "Delete my data",
  restriction: "Restrict how my data is used",
  objection: "Object to how my data is used",
  portability: "Receive my data in a portable format",
} as const;
export type RequestKind = keyof typeof REQUEST_KINDS;

export const REQUEST_STATUSES = ["open", "in_progress", "completed", "rejected"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days until the deadline (negative when late); a finished request is never overdue. */
export function slaState(dueAt: string, status: RequestStatus, now = new Date()) {
  const finished = status === "completed" || status === "rejected";
  const daysLeft = Math.ceil((new Date(dueAt).getTime() - now.getTime()) / DAY_MS);
  return { daysLeft, overdue: !finished && daysLeft < 0, dueSoon: !finished && daysLeft >= 0 && daysLeft <= 7 };
}
