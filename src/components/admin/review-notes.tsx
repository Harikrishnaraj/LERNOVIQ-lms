"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addReviewNote, deleteReviewNote } from "@/features/admin/review-actions";
import { NOTE_MAX, type ReviewNote } from "@/features/admin/review";

/** The notes on one target, plus (when allowed) a form to add one. */
export function ReviewNotes({
  courseId,
  target,
  label,
  notes,
  currentUserId,
  canAdd,
}: {
  courseId: string;
  target: { type: "course" | "section" | "lesson"; id: string | null };
  label: string;
  notes: ReviewNote[];
  currentUserId: string;
  canAdd: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await addReviewNote(courseId, target, body);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setBody("");
    setOpen(false);
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const r = await deleteReviewNote(courseId, id);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="space-y-2">
      {notes.length > 0 && (
        <ul aria-label={`Notes on ${label}`} className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 rounded-control border border-warning bg-warning-light p-2 text-sm text-warning-text">
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{n.body}</span>
              {n.authorId === currentUserId && canAdd && (
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  disabled={busy}
                  aria-label={`Delete note: ${n.body.slice(0, 30)}`}
                  className="rounded-control p-1 hover:bg-warning/20"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd &&
        (open ? (
          <form onSubmit={onSubmit} className="space-y-2" noValidate>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Note on {label}
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={NOTE_MAX}
                disabled={busy}
                className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal"
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-danger-text">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" loading={busy}>
                Save note
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Add note<span className="sr-only"> on {label}</span>
          </Button>
        ))}
    </div>
  );
}
