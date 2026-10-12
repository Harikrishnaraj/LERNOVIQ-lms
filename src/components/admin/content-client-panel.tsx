"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  deleteContentClientAction,
  updateContentClientAction,
} from "@/features/content-server/actions";
import type { ContentClientDetail } from "@/features/content-server/queries";
import { CLIENT_NAME_MAX, NOTES_MAX } from "@/features/content-server/rules";
import { Button } from "@/components/ui/button";
import { FIELD } from "./content-client-list";

/** Customer details: edit, and delete with a confirmation step (removes every licence and dispatch). */
export function ContentClientPanel({ client }: { client: ContentClientDetail }) {
  const router = useRouter();
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.contactEmail ?? "");
  const [notes, setNotes] = useState(client.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const ids = { name: useId(), email: useId(), notes: useId() };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await updateContentClientAction(client.id, { name, contactEmail: email, notes });
    setBusy(false);
    setMessage(res.ok ? { ok: true, text: "Customer saved." } : { ok: false, text: res.error });
    if (res.ok) router.refresh();
  }

  async function remove() {
    setBusy(true);
    const res = await deleteContentClientAction(client.id);
    setBusy(false);
    if (!res.ok) {
      setConfirming(false);
      setMessage({ ok: false, text: res.error });
      return;
    }
    router.push("/admin/content-server");
  }

  return (
    <section aria-labelledby="client-heading" className="space-y-3">
      <h2 id="client-heading" className="text-base font-semibold">
        Customer details
      </h2>
      <form onSubmit={save} className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <label
          className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
          htmlFor={ids.name}
        >
          Name
          <input
            id={ids.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CLIENT_NAME_MAX}
            className={FIELD}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
          htmlFor={ids.email}
        >
          Contact email
          <input
            id={ids.email}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs font-medium text-text-secondary sm:col-span-2"
          htmlFor={ids.notes}
        >
          Notes
          <textarea
            id={ids.notes}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={NOTES_MAX}
            rows={2}
            className={FIELD}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={busy}>
            {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
            Save customer
          </Button>
          {confirming ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={remove}
                disabled={busy}
              >
                Confirm delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setConfirming(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <span className="text-xs text-text-secondary">
                This removes every licence; the customer&apos;s packages stop working.
              </span>
            </>
          ) : (
            <Button type="button" size="sm" variant="secondary" onClick={() => setConfirming(true)}>
              Delete customer
            </Button>
          )}
        </div>
      </form>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-success-text" : "text-danger-text"}`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
