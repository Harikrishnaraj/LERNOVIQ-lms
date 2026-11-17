"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitVisitorRequestAction } from "@/features/privacy/request-actions";
import { REQUEST_KINDS, type RequestKind } from "@/features/privacy/requests";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const field = "rounded-control border border-border bg-surface px-3 py-2 text-base";

/** T-296 (F-449): privacy requests from people without an account, into the staff queue. */
export function PrivacyRequestForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await submitVisitorRequestAction(
        String(fd.get("email") ?? ""),
        String(fd.get("kind")) as RequestKind,
        String(fd.get("details") ?? ""),
        String(fd.get("website") ?? ""),
      );
      if (!res.ok) setError(res.error);
      else {
        form.reset();
        setDone(`Request received. We will reply by email by ${res.dueAt ? dateFormat.format(new Date(res.dueAt)) : "one month from today"}.`);
      }
    });
  }

  if (done) {
    return (
      <p role="status" className="rounded-card border border-border bg-surface p-5 text-base">
        {done}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Email address we should reply to
        <input name="email" type="email" required autoComplete="email" maxLength={254} className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What are you asking for?
        <select name="kind" required defaultValue="" className={field}>
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(REQUEST_KINDS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Details (optional)
        <textarea name="details" rows={4} maxLength={2000} className={field} />
      </label>
      <p className="text-sm text-text-secondary">We may ask you to confirm your identity before we release or change any data.</p>
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
        Send request
      </Button>
    </form>
  );
}
