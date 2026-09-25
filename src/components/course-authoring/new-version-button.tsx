"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { startNewVersion } from "@/features/course-authoring/version-actions";

export function NewVersionButton({ courseId, nextVersion }: { courseId: string; nextVersion: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const r = await startNewVersion(courseId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.push(`/instructor/courses/${courseId}/basics`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} loading={busy}>
        Start version {nextVersion} to make changes
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
