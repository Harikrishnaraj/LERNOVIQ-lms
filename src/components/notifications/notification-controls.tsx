"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteNotification, markAllRead, markRead, setPreference } from "@/features/notifications/actions";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    else router.refresh();
  }
  return { busy, error, run };
}

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const { busy, error, run } = useRun();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={() => run(markAllRead)} loading={busy} disabled={disabled}>
        Mark all as read
      </Button>
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}

export function ItemControls({ id, read, title }: { id: string; read: boolean; title: string }) {
  const { busy, error, run } = useRun();
  return (
    <span className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy} onClick={() => run(() => markRead(id, !read))} className="text-xs text-text-secondary hover:text-text">
        {read ? "Mark as unread" : "Mark as read"}
        <span className="sr-only">: {title}</span>
      </button>
      <button type="button" disabled={busy} onClick={() => run(() => deleteNotification(id))} className="text-xs text-text-secondary hover:text-danger-text">
        Delete<span className="sr-only">: {title}</span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger-text">
          {error}
        </span>
      )}
    </span>
  );
}

export function PreferenceToggle({ category, label, description, initial }: { category: string; label: string; description: string; initial: boolean }) {
  const { busy, error, run } = useRun();
  const [on, setOn] = useState(initial);
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-text-secondary">{description}</span>
        {error && (
          <span role="alert" className="block text-xs text-danger-text">
            {error}
          </span>
        )}
      </span>
      <label className="inline-flex shrink-0 items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={on}
          disabled={busy}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            run(async () => {
              const r = await setPreference(category, next);
              if (!r.ok) setOn(!next);
              return r;
            });
          }}
        />
        <span>
          In-app<span className="sr-only"> notifications for {label}</span>
        </span>
      </label>
    </li>
  );
}
