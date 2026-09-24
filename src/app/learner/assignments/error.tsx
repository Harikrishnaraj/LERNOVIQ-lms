"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function AssignmentsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="We could not load your assignments"
      description="Your work is safe. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
