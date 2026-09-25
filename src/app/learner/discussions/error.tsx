"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function DiscussionsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="We could not load discussions"
      description="Please try again in a moment."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
