"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function CourseError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="We could not load this course"
      description="Your course is unchanged. Please try again."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
