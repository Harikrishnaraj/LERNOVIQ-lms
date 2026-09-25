"use client";

import { ErrorState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export default function NotificationsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <ErrorState
      title="We could not load your notifications"
      description="Please try again in a moment."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
