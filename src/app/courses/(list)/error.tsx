"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-10">
      <ErrorState
        reference={error.digest}
        title="We could not load the courses"
        description="Something went wrong on our side. Please try again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
