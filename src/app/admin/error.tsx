"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="We could not load this page"
      description="Nothing was changed. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
