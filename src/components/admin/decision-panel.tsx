"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { decideCourse } from "@/features/courses/transition-actions";
import { ACTION_LABEL, MAX_REVIEW_NOTE, NOTE_REQUIRED, type ReviewerAction } from "@/features/courses/transition-rules";

const DESTRUCTIVE: ReadonlySet<ReviewerAction> = new Set(["reject", "archive"]);

const HELP: Partial<Record<ReviewerAction, string>> = {
  start_review: "Claim this course and begin reviewing it.",
  request_changes: "Send it back to the instructor with your notes. They can edit and resubmit.",
  approve: "The course passes review. It is not visible to learners until it is published.",
  reject: "Refuse this submission. The instructor keeps your feedback and can rework it as a draft.",
  publish: "Make this version live in the catalog. Any previously live version is archived.",
  archive: "Take the course off the catalog. Enrolled learners keep their access.",
  reopen: "Return a rejected course to the instructor as a draft.",
};

/** The decisions a reviewer can take from the current status (already filtered by the caller). */
export function DecisionPanel({
  courseId,
  actions,
  failingChecks,
}: {
  courseId: string;
  actions: ReviewerAction[];
  failingChecks: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<ReviewerAction | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (actions.length === 0) {
    return <p className="text-sm text-text-secondary">No decisions are available for this status.</p>;
  }

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError(null);
    const r = await decideCourse(courseId, pending, note);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setPending(null);
    setNote("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Decisions">
        {actions.map((a) => (
          <Button
            key={a}
            type="button"
            size="sm"
            variant={DESTRUCTIVE.has(a) ? "secondary" : pending === a ? "primary" : "secondary"}
            aria-pressed={pending === a}
            onClick={() => {
              setPending(a);
              setError(null);
            }}
            disabled={busy}
          >
            {ACTION_LABEL[a]}
          </Button>
        ))}
      </div>

      {pending && (
        <form onSubmit={confirm} className="space-y-3 rounded-control border border-border p-3" noValidate aria-label={`Confirm: ${ACTION_LABEL[pending]}`}>
          <p className="text-sm">{HELP[pending]}</p>
          {failingChecks > 0 && (pending === "approve" || pending === "publish") && (
            <p role="status" className="text-sm text-warning-text">
              {failingChecks} automatic {failingChecks === 1 ? "check is" : "checks are"} still failing.
            </p>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            {NOTE_REQUIRED.has(pending) ? "Note to the instructor (required)" : "Note (optional)"}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={MAX_REVIEW_NOTE}
              disabled={busy}
              className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>
              Confirm {ACTION_LABEL[pending].toLowerCase()}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
