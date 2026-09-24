"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enrollInPath, leavePath } from "@/features/paths/path-actions";

export function PathFollowButton({ slug, enrolled }: { slug: string; enrolled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const r = enrolled ? await leavePath(slug) : await enrollInPath(slug);
    setBusy(false);
    if (!r.ok) setError(r.error);
    else router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button onClick={toggle} loading={busy} variant={enrolled ? "secondary" : "primary"}>
        {enrolled ? "Stop following" : "Follow this path"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
