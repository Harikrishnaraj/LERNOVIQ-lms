"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateSubjectRequestAction } from "@/features/privacy/request-actions";
import type { RequestStatus } from "@/features/privacy/requests";

/** F-444 (T-286): staff set a request in progress, or finish it with a note. */
export function PrivacyRequestForm({ id }: { id: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const res = await updateSubjectRequestAction(id, String(fd.get("status")) as RequestStatus, String(fd.get("note") ?? ""));
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2 border-t border-border-subtle pt-3">
      <label className="flex flex-col gap-1 text-sm">
        Status
        <select name="status" defaultValue="in_progress" className="rounded-control border border-border bg-surface px-3 py-2">
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Note (required to complete or reject)
        <textarea name="note" rows={2} maxLength={2000} className="rounded-control border border-border bg-surface px-3 py-2" />
      </label>
      <Button type="submit" size="sm" disabled={pending}>
        {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Save
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}
