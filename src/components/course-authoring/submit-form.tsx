"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_SUBMISSION_NOTES } from "@/features/course-authoring/readiness";
import { submitCourseForReview } from "@/features/course-authoring/submit-actions";

export function SubmitForm({ courseId, resubmit }: { courseId: string; resubmit: boolean }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMissing([]);
    const result = await submitCourseForReview(courseId, notes);
    setBusy(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    setError(result.error);
    setMissing(result.missing ?? []);
  }

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5" noValidate>
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p>{error}</p>
            {missing.length > 0 && <p className="mt-1">Still missing: {missing.join(", ")}.</p>}
          </div>
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Notes for the reviewer (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          maxLength={MAX_SUBMISSION_NOTES}
          disabled={busy}
          className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal"
        />
        <span className="text-xs font-normal text-text-secondary">
          Anything the reviewer should know: what changed, where to look, test accounts.
        </span>
      </label>
      <Button type="submit" loading={busy}>
        {resubmit ? "Resubmit for review" : "Submit for review"}
      </Button>
    </form>
  );
}
