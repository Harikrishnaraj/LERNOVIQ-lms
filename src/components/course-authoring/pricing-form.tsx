"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savePricing } from "@/features/course-authoring/pricing-actions";
import {
  CURRENCIES,
  MAX_PREREQUISITES,
  VISIBILITY_OPTIONS,
  formatCentsAsAmount,
  validatePricing,
} from "@/features/course-authoring/pricing-rules";
import type { PricingForEditing } from "@/features/course-authoring/pricing";

const field = "h-10 w-full rounded-input border border-border bg-surface px-3 text-sm";

export function PricingForm({
  courseId,
  initial,
  disabled = false,
}: {
  courseId: string;
  initial: PricingForEditing;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(initial.priceCents > 0 ? "paid" : "free");
  const [amount, setAmount] = useState(initial.priceCents > 0 ? formatCentsAsAmount(initial.priceCents) : "");
  const [currency, setCurrency] = useState<string>(initial.currency);
  const [certificate, setCertificate] = useState(initial.certificateEnabled);
  const [visibility, setVisibility] = useState<string>(initial.visibility);
  const [prereqs, setPrereqs] = useState<string[]>(initial.prerequisiteIds);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = saving || disabled;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    const input = { mode, amount, currency, certificateEnabled: certificate, visibility, prerequisiteIds: prereqs };
    const check = validatePricing(input); // instant feedback; the server validates again
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const r = await savePricing(courseId, input);
      if (r.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setFormError(r.error);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-2xl space-y-8">
      {formError && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}
      {saved && (
        <div role="status" className="flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Saved. Your changes are stored as a draft.</span>
        </div>
      )}

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-base font-semibold">Price</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" value="free" checked={mode === "free"} onChange={() => setMode("free")} className="size-4 accent-primary" />
            Free
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="mode" value="paid" checked={mode === "paid"} onChange={() => setMode("paid")} className="size-4 accent-primary" />
            Paid
          </label>
        </div>
        {mode === "paid" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Price
              <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="49.99" className={field} />
              {errors.amount && <span role="alert" className="text-xs text-danger-text">{errors.amount}</span>}
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Currency
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={field}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {mode === "paid" && (
          <p className="text-xs text-text-secondary">Learners cannot buy paid courses until checkout is set up; free courses enroll instantly.</p>
        )}
      </fieldset>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-base font-semibold">Completion</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={certificate} onChange={(e) => setCertificate(e.target.checked)} className="size-4 accent-primary" />
          Issue a certificate when a learner completes the course
        </label>
      </fieldset>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-base font-semibold">Visibility</legend>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Who can find this course
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className={field}>
            {VISIBILITY_OPTIONS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <fieldset className="space-y-3" disabled={busy}>
        <legend className="text-base font-semibold">Prerequisites</legend>
        <p className="text-sm text-text-secondary">
          Learners must complete these courses before they can enroll (up to {MAX_PREREQUISITES}).
        </p>
        {initial.candidates.length === 0 ? (
          <p className="text-sm text-text-secondary">You have no other courses to require yet.</p>
        ) : (
          <ul className="space-y-2">
            {initial.candidates.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={prereqs.includes(c.id)}
                    onChange={(e) => setPrereqs((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))}
                    className="size-4 accent-primary"
                  />
                  {c.title}
                </label>
              </li>
            ))}
          </ul>
        )}
        {errors.prerequisiteIds && <p role="alert" className="text-xs text-danger-text">{errors.prerequisiteIds}</p>}
      </fieldset>

      <Button type="submit" loading={saving} disabled={disabled}>
        Save settings
      </Button>
    </form>
  );
}
