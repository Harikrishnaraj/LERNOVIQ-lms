"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { reopenRejectedCourse } from "@/features/course-authoring/feedback-actions";

export function ReopenButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    setBusy(true);
    setError(null);
    const r = await reopenRejectedCourse(courseId);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button onClick={reopen} loading={busy}>
        Reopen as draft
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
