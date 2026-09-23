"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveResult } from "@/features/my-learning/saved";

export function SaveButton({
  saved,
  onToggle,
}: {
  saved: boolean;
  onToggle: () => Promise<SaveResult>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const result = await onToggle();
      if ("error" in result) setError(result.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        className="w-full"
        loading={pending}
        aria-pressed={saved}
        onClick={handleClick}
      >
        {!pending && <Icon className="size-4" aria-hidden="true" />}
        {saved ? "Saved" : "Save for later"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
