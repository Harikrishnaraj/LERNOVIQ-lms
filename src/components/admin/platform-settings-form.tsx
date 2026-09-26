"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PORTALS } from "@/types/portal";
import type { PlatformSettings } from "@/services/settings";
import { updatePlatformSettingsAction } from "@/features/admin/settings-actions";
import { Button } from "@/components/ui/button";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const router = useRouter();
  const [minPasswordLength, setMinPasswordLength] = useState(String(settings.minPasswordLength));
  const [mfaPortals, setMfaPortals] = useState<string[]>(settings.mfaRequiredPortals);
  const [idleTimeout, setIdleTimeout] = useState(settings.sessionIdleTimeoutMinutes === null ? "" : String(settings.sessionIdleTimeoutMinutes));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function togglePortal(portal: string) {
    setMfaPortals((prev) => (prev.includes(portal) ? prev.filter((p) => p !== portal) : [...prev, portal]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await updatePlatformSettingsAction({
      minPasswordLength,
      mfaRequiredPortals: mfaPortals,
      sessionIdleTimeoutMinutes: idleTimeout,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-5">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Minimum password length
        <input
          type="number"
          min={8}
          max={128}
          value={minPasswordLength}
          onChange={(e) => setMinPasswordLength(e.target.value)}
          className="w-32 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs font-normal text-text-secondary">Applies to signup and reset. Admin-created accounts always require at least 12.</span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Portals requiring MFA</legend>
        {PORTALS.map((portal) => (
          <label key={portal} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mfaPortals.includes(portal)} onChange={() => togglePortal(portal)} className="size-4" />
            <span className="capitalize">{portal}</span>
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Idle session timeout (minutes)
        <input
          type="number"
          min={5}
          max={10080}
          placeholder="Off"
          value={idleTimeout}
          onChange={(e) => setIdleTimeout(e.target.value)}
          className="w-32 rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <span className="text-xs font-normal text-text-secondary">Leave blank to disable idle sign-out.</span>
      </label>

      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
        Save settings
      </Button>
      {saved && <span className="ml-3 text-sm text-success-text">Saved.</span>}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}
