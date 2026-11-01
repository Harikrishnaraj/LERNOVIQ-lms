"use client";

import { useState, useTransition } from "react";
import { updateResourceExpiry } from "@/features/instructor/resource-actions";
import { Button } from "@/components/ui/button";

/** Sets or clears the expiry date of one library resource. Blank means it never expires. */
export function ResourceExpiryControl({ resourceId, current }: { resourceId: string; current: string }) {
  const [value, setValue] = useState(current);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setMessage(null);
    startTransition(async () => {
      const res = await updateResourceExpiry(resourceId, value);
      setMessage(res.ok ? { ok: true, text: "Expiry saved." } : { ok: false, text: res.error });
    });
  }

  const id = `expiry-${resourceId}`;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={id} className="text-xs font-medium text-text-secondary">
            Expiry date (optional, UTC)
          </label>
          <input
            id={id}
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={isPending}
            className="h-9 rounded-input border border-border bg-surface px-3 text-sm"
          />
        </div>
        <Button type="button" size="sm" variant="secondary" disabled={isPending || value === current} onClick={save}>
          Save expiry
        </Button>
      </div>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-xs text-success-text" : "text-xs text-danger-text"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
