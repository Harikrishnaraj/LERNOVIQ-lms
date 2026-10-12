"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  createLicenceAction,
  updateLicenceAction,
  type LicenceInput,
} from "@/features/content-server/actions";
import { LICENCE_NAME_MAX } from "@/features/content-server/rules";
import { Button } from "@/components/ui/button";
import { FIELD } from "./content-client-list";

/** Create a licence, or edit one (pass licenceId + initial). */
export function ContentLicenceForm({
  clientId,
  licenceId,
  initial,
  onDone,
}: {
  clientId: string;
  licenceId?: string;
  initial?: LicenceInput;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<LicenceInput>(
    initial ?? { name: "", seatLimit: "", expiresOn: "", allowedOrigins: "" },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefix = useId();
  const id = (k: string) => `${prefix}-${k}`;
  const set =
    (k: keyof LicenceInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = licenceId
      ? await updateLicenceAction(clientId, licenceId, form)
      : await createLicenceAction(clientId, form);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    if (!licenceId) setForm({ name: "", seatLimit: "", expiresOn: "", allowedOrigins: "" });
    onDone?.();
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 sm:grid-cols-3"
      aria-label={licenceId ? "Edit licence" : "New licence"}
    >
      <label
        className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
        htmlFor={id("name")}
      >
        Licence name
        <input
          id={id("name")}
          value={form.name}
          onChange={set("name")}
          maxLength={LICENCE_NAME_MAX}
          placeholder="2026 contract"
          className={FIELD}
        />
      </label>
      <label
        className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
        htmlFor={id("seats")}
      >
        Seats (blank = unlimited)
        <input
          id={id("seats")}
          inputMode="numeric"
          value={form.seatLimit}
          onChange={set("seatLimit")}
          placeholder="500"
          className={FIELD}
        />
      </label>
      <label
        className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
        htmlFor={id("expires")}
      >
        Expires on (blank = never)
        <input
          id={id("expires")}
          type="date"
          value={form.expiresOn}
          onChange={set("expiresOn")}
          className={FIELD}
        />
      </label>
      <label
        className="flex flex-col gap-1 text-xs font-medium text-text-secondary sm:col-span-3"
        htmlFor={id("origins")}
      >
        LMS web addresses allowed to show the content (one per line)
        <textarea
          id={id("origins")}
          value={form.allowedOrigins}
          onChange={set("allowedOrigins")}
          rows={2}
          placeholder="https://lms.customer.com"
          className={`font-mono ${FIELD}`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          {licenceId ? "Save licence" : "Create licence"}
        </Button>
        {onDone && licenceId && (
          <Button type="button" size="sm" variant="secondary" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger-text sm:col-span-3">
          {error}
        </p>
      )}
    </form>
  );
}
