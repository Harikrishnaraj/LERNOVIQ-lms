"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAiTutorAccess } from "@/features/admin/ai-access-actions";

/** Admin switch for one user's AI Tutor access (T-206, ADR-043). */
export function AiTutorAccessToggle({
  userId,
  enabled,
  name,
}: {
  userId: string;
  enabled: boolean;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const result = await setAiTutorAccess(userId, !enabled);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant={enabled ? "secondary" : "primary"} onClick={toggle} loading={busy}>
        {enabled ? "Turn off AI Tutor" : "Turn on AI Tutor"}
        <span className="sr-only"> for {name}</span>
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
