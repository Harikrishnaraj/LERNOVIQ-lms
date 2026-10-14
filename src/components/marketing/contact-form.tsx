"use client";

import { useState, useTransition, type FormEvent } from "react";
import { submitEnquiry } from "@/features/enquiries/actions";
import {
  AUDIENCE_OPTIONS,
  INDUSTRY_OPTIONS,
  SOLUTION_OPTIONS,
  TIMELINE_OPTIONS,
  enquiryErrors,
} from "@/features/enquiries/schema";
import { cn } from "@/lib/utils/cn";

type Kind = "consultation" | "demo";

const FIELDS: {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  options?: readonly string[];
  optional?: boolean;
}[] = [
  { name: "name", label: "Name", type: "text", autoComplete: "name" },
  { name: "email", label: "Work email", type: "email", autoComplete: "email" },
  { name: "organization", label: "Organization", type: "text", autoComplete: "organization" },
  { name: "country", label: "Country or region", type: "text", autoComplete: "country-name" },
  { name: "industry", label: "Industry", options: INDUSTRY_OPTIONS },
  { name: "solution", label: "Solution of interest", options: SOLUTION_OPTIONS },
  { name: "audience", label: "Approximate learner audience", options: AUDIENCE_OPTIONS, optional: true },
  { name: "timeline", label: "Desired timeline", options: TIMELINE_OPTIONS, optional: true },
];

const control = "min-h-12 rounded-input border-[1.5px] bg-surface px-3.5 text-base text-text";

// Consultation / LMS-demo form from the design export (Contact.dc.html), wired to submitEnquiry
// (T-264, F-963). Validated here for instant feedback and again on the server.
export function ContactForm({ initialKind }: { initialKind: Kind }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const demo = kind === "demo";

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      kind,
      ...Object.fromEntries(FIELDS.map((f) => [f.name, String(fd.get(f.name) ?? "")])),
      details: String(fd.get("details") ?? ""),
      consent: fd.get("consent") === "on",
    };
    const found = enquiryErrors(input);
    if (found) {
      setErrors(found);
      setFormError("Please complete the highlighted fields.");
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const res = await submitEnquiry(input as Parameters<typeof submitEnquiry>[0]);
      if (res.ok) setSubmitted(true);
      else {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
      }
    });
  };

  if (submitted) {
    return (
      <div role="status" className="flex flex-col gap-4 rounded-2xl border border-success bg-success-light p-[clamp(24px,4vw,48px)]">
        <span className="flex size-12 items-center justify-center rounded-full bg-landing-green text-[22px] font-extrabold text-white" aria-hidden="true">
          ✓
        </span>
        <h2 className="text-2xl font-extrabold">Thank you for contacting LERNOVIQ.</h2>
        <p className="text-[17px] leading-[1.7] text-landing-body">
          Your inquiry has been received. Our team will review your requirements and get back to you using
          the contact details provided.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="min-h-11 cursor-pointer self-start rounded-input border-[1.5px] border-landing-outline bg-surface px-[18px] text-[15px] font-bold"
        >
          Send another enquiry
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="form-h"
      className="flex flex-col gap-[22px] rounded-2xl border border-border bg-surface p-[clamp(20px,4vw,40px)]"
    >
      <div className="flex flex-col gap-3.5">
        <h2 id="form-h" className="text-2xl font-extrabold">
          {demo ? "Request an LMS walkthrough" : "Tell us about your learning needs"}
        </h2>
        <div role="radiogroup" aria-label="Enquiry type" className="flex w-fit max-w-full flex-wrap gap-1.5 rounded-xl bg-border-subtle p-[5px]">
          {(
            [
              ["consultation", "Request a Consultation"],
              ["demo", "Request an LMS Demo"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={cn("min-h-11 cursor-pointer rounded-control px-4 text-sm font-bold", kind === k ? "bg-surface" : "bg-transparent")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {formError && (
        <p role="alert" className="rounded-input border border-danger bg-danger-light px-4 py-3 text-sm font-semibold text-danger-text">
          {formError}
        </p>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-x-5 gap-y-[18px]">
        {FIELDS.map((f) => {
          const err = errors[f.name];
          const errId = `${f.name}-error`;
          const common = {
            id: f.name,
            name: f.name,
            "aria-invalid": err ? true : undefined,
            "aria-describedby": err ? errId : undefined,
            className: cn(control, err ? "border-danger" : "border-landing-outline"),
          };
          return (
            <div key={f.name} className="flex flex-col gap-2">
              <label htmlFor={f.name} className="text-sm font-bold">
                {f.label}
                {f.optional && <span className="font-medium text-neutral-text"> (optional)</span>}
              </label>
              {f.options ? (
                <select
                  {...common}
                  // Remount when the type changes so the demo preset applies (as in the export).
                  key={f.name === "solution" ? kind : f.name}
                  defaultValue={f.name === "solution" && demo ? "LERNOVIQ LMS & Learning Technology" : ""}
                >
                  <option value="">Select</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...common} type={f.type} autoComplete={f.autoComplete} maxLength={f.name === "email" ? 254 : 160} />
              )}
              {err && (
                <span id={errId} className="text-[13px] font-semibold text-danger-text">
                  {err}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="details" className="text-sm font-bold">
          Project details
        </label>
        <textarea
          id="details"
          name="details"
          rows={5}
          maxLength={5000}
          aria-invalid={errors.details ? true : undefined}
          aria-describedby={errors.details ? "details-error details-help" : "details-help"}
          className={cn("resize-y rounded-input border-[1.5px] px-3.5 py-3 text-base leading-[1.6]", errors.details ? "border-danger" : "border-landing-outline")}
        />
        {errors.details && (
          <span id="details-error" className="text-[13px] font-semibold text-danger-text">
            {errors.details}
          </span>
        )}
        <span id="details-help" className="text-[13px] text-neutral-text">
          Goals, learners, existing content or systems, and anything else we should know.
        </span>
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm leading-[1.6] text-landing-body">
        <input type="checkbox" name="consent" aria-invalid={errors.consent ? true : undefined} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span>
          I agree that LERNOVIQ may use the information I provide to respond to this enquiry.{" "}
          {errors.consent && <span className="font-semibold text-danger-text">{errors.consent}</span>}
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="min-h-[52px] cursor-pointer self-start rounded-input bg-primary px-7 text-base font-bold text-white hover:bg-primary-dark disabled:opacity-60"
      >
        {pending ? "Sending…" : demo ? "Request an LMS Demo" : "Request a Consultation"}
      </button>
      <p className="text-[13px] leading-[1.6] text-neutral-text">We use your details only to respond to your enquiry.</p>
    </form>
  );
}
