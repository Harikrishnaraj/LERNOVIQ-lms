"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EnrollResult } from "@/features/enrollment/enroll";

export function EnrollButton({ onEnroll }: { onEnroll: () => Promise<EnrollResult> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const result = await onEnroll();
      // On success the server action revalidates the page, which swaps this button for
      // the enrolled state.
      if ("error" in result) setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button size="lg" className="w-full" loading={pending} onClick={handleClick}>
        Enroll for free
      </Button>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
