"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function LearnerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="Something went wrong"
      description="We could not load this page. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
