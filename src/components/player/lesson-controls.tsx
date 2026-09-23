"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompleteResult } from "@/features/player/progress";

/** "Mark complete" for an enrolled learner; on success moves on to the next lesson if any. */
export function LessonControls({
  completed,
  nextHref,
  onComplete,
}: {
  completed: boolean;
  nextHref: string | null;
  onComplete: () => Promise<CompleteResult>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (completed) {
    return (
      <p role="status" className="inline-flex items-center gap-2 text-sm font-medium text-success-text">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Lesson completed
      </p>
    );
  }

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const result = await onComplete();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (nextHref) router.push(nextHref);
      else router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button loading={pending} onClick={handleClick}>
        {nextHref ? "Mark complete and continue" : "Mark complete"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
