"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function PathsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="We could not load learning paths"
      description="Please try again in a moment."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
