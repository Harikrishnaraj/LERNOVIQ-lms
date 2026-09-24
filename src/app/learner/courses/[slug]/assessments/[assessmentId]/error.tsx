"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function AssessmentError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <ErrorState
        title="We could not load this assessment"
        description="Your saved answers are safe. Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
