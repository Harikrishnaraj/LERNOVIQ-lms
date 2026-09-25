"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REVIEW_MAX } from "@/features/reviews/reviews";
import { deleteReview, saveReview } from "@/features/reviews/actions";
import { cn } from "@/lib/utils/cn";

export function ReviewForm({ courseId, initial }: { courseId: string; initial: { rating: number; body: string } | null }) {
  const router = useRouter();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(initial?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ rating?: string; body?: string }>({});
  const [saved, setSaved] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setSaved(false);
    const r = await saveReview(courseId, { rating, body });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const r = await deleteReview(courseId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRating(0);
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Write a review" className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-4">
      <fieldset className="space-y-1" disabled={busy}>
        <legend className="text-sm font-medium">Your rating</legend>
        <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
              <input type="radio" name="rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <Star className={cn("size-7", (hover || rating) >= n ? "fill-warning text-warning" : "text-border")} aria-hidden="true" />
              <span className="sr-only">
                {n} {n === 1 ? "star" : "stars"}
              </span>
            </label>
          ))}
        </div>
        {fieldErrors.rating && <p role="alert" className="text-xs text-danger-text">{fieldErrors.rating}</p>}
      </fieldset>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your review (optional)
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={REVIEW_MAX} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
        {fieldErrors.body && <span role="alert" className="text-xs text-danger-text">{fieldErrors.body}</span>}
      </label>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      {saved && <p role="status" className="text-sm text-success-text">Thanks, your review is saved.</p>}
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          {initial ? "Update review" : "Post review"}
        </Button>
        {initial && (
          <Button type="button" variant="secondary" onClick={remove} disabled={busy}>
            Delete my review
          </Button>
        )}
      </div>
    </form>
  );
}
