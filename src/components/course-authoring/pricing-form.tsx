"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveCourseSettings } from "@/features/course-authoring/pricing-actions";
import { MAX_PREREQUISITES, VISIBILITY_OPTIONS, validateCourseSettings } from "@/features/course-authoring/pricing-rules";
import type { PricingForEditing } from "@/features/course-authoring/pricing";
import { formatPrice } from "@/lib/utils/format";

const field = "h-10 w-full rounded-input border border-border bg-surface px-3 text-sm";

/** Course settings the instructor controls. The price is shown read-only: the platform sets it (ADR-037). */
export function CourseSettingsForm({
  courseId,
  initial,
  disabled = false,
}: {
  courseId: string;
  initial: PricingForEditing;
  disabled?: boolean;
}) {
  const router = useRouter();
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
    const input = { certificateEnabled: certificate, visibility, prerequisiteIds: prereqs };
    const check = validateCourseSettings(input); // instant feedback; the server validates again
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const r = await saveCourseSettings(courseId, input);
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

      <section aria-labelledby="price-heading" className="space-y-1">
        <h2 id="price-heading" className="text-base font-semibold">
          Price
        </h2>
        <p className="text-sm">{formatPrice(initial.priceCents, initial.currency)}</p>
        <p className="text-xs text-text-secondary">Course prices are set by the platform team, not by instructors.</p>
      </section>

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
