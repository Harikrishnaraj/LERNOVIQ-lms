"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createContentClientAction } from "@/features/content-server/actions";
import type { ContentClientSummary } from "@/features/content-server/queries";
import { CLIENT_NAME_MAX } from "@/features/content-server/rules";
import { EmptyState } from "@/components/feedback/states";
import { Button } from "@/components/ui/button";

export const FIELD =
  "rounded-control border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

export function ContentClientList({ clients }: { clients: ContentClientSummary[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createContentClientAction({ name, contactEmail: email });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push(`/admin/content-server/${res.id}`);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={create}
        className="flex flex-wrap items-end gap-2"
        aria-label="Add a customer"
      >
        <label
          className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
          htmlFor={nameId}
        >
          Customer name
          <input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={CLIENT_NAME_MAX}
            placeholder="Acme Bank"
            className={`min-w-48 ${FIELD}`}
          />
        </label>
        <label
          className="flex flex-col gap-1 text-xs font-medium text-text-secondary"
          htmlFor={emailId}
        >
          Contact email (optional)
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="lms-admin@acme.example"
            className={`min-w-56 ${FIELD}`}
          />
        </label>
        <Button type="submit" size="sm" disabled={busy}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Add customer
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {clients.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add a customer that runs its own LMS, then give it a licence for the courses it may use."
        />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-card border border-border">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/admin/content-server/${c.id}`}
                className="hover:bg-surface-subtle flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  {c.contactEmail && (
                    <span className="ml-2 break-all text-text-secondary">{c.contactEmail}</span>
                  )}
                </span>
                <span className="text-text-secondary">
                  {c.activeLicenceCount} active of {c.licenceCount}{" "}
                  {c.licenceCount === 1 ? "licence" : "licences"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
