"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { setCoursePriceAction } from "@/features/admin/course-price-actions";
import { CURRENCIES, formatCentsAsAmount, validateCoursePrice } from "@/features/course-authoring/pricing-rules";

/** The platform's price for a course (ADR-037). Applies to every version of the course. */
export function CoursePriceForm({
  courseId,
  priceCents,
  currency: initialCurrency,
}: {
  courseId: string;
  priceCents: number;
  currency: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState(priceCents > 0 ? "paid" : "free");
  const [amount, setAmount] = useState(priceCents > 0 ? formatCentsAsAmount(priceCents) : "");
  const [currency, setCurrency] = useState(initialCurrency);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    const input = { mode, amount, currency };
    const check = validateCoursePrice(input); // instant feedback; the server validates again
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const r = await setCoursePriceAction(courseId, input);
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
    <form onSubmit={submit} noValidate aria-label="Course price" className="space-y-3">
      {formError && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="flex items-start gap-2 text-sm text-success-text">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Price saved.
        </p>
      )}
      <fieldset className="space-y-3" disabled={saving}>
        <legend className="sr-only">Free or paid</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="price-mode" value="free" checked={mode === "free"} onChange={() => setMode("free")} className="size-4 accent-primary" />
            Free
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="price-mode" value="paid" checked={mode === "paid"} onChange={() => setMode("paid")} className="size-4 accent-primary" />
            Paid
          </label>
        </div>
        {mode === "paid" && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Price" inputMode="decimal" placeholder="49.99" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
            <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
          </div>
        )}
        {errors.currency && <p role="alert" className="text-xs text-danger-text">{errors.currency}</p>}
      </fieldset>
      <p className="text-xs text-text-secondary">Applies to the live course and any draft. Learners cannot buy paid courses until checkout is set up.</p>
      <Button type="submit" size="sm" loading={saving}>
        Save price
      </Button>
    </form>
  );
}
