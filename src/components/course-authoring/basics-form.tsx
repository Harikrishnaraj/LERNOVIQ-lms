"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LANGUAGE_OPTIONS, LEVEL_OPTIONS } from "@/features/catalog/filters";
import type { BasicsResult } from "@/features/course-authoring/actions";

export interface BasicsFormValues {
  title: string;
  subtitle: string;
  categorySlug: string;
  description: string;
  outcomes: string;
  requirements: string;
  level: string;
  language: string;
  thumbnailUrl: string | null;
}

export function BasicsForm({
  mode,
  categories,
  initial,
  disabled = false,
  onSubmit,
  createdRedirectTemplate,
  initialNotice,
}: {
  mode: "create" | "edit";
  categories: { slug: string; name: string }[];
  initial: BasicsFormValues;
  disabled?: boolean;
  onSubmit: (data: FormData) => Promise<BasicsResult>;
  /** After creating, where to go; "{id}" is replaced with the new course id. */
  createdRedirectTemplate?: string;
  initialNotice?: string | null;
}) {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(initialNotice ?? null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await onSubmit(new FormData(event.currentTarget));
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setFormError(result.error ?? null);
        return;
      }
      if (mode === "create" && createdRedirectTemplate) {
        const suffix = result.thumbnailError ? `?thumbnail=failed` : "";
        router.push(`${createdRedirectTemplate.replace("{id}", result.courseId)}${suffix}`);
        return;
      }
      setNotice("Saved. Your changes are stored as a draft.");
      router.refresh();
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || disabled;
  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl space-y-5">
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      )}

      <Input
        label="Course title"
        name="title"
        defaultValue={initial.title}
        maxLength={120}
        required
        disabled={busy}
        error={fieldErrors.title}
        hint="What learners will see first. You can change it later."
      />
      <Input
        label="Subtitle"
        name="subtitle"
        defaultValue={initial.subtitle}
        maxLength={200}
        disabled={busy}
        error={fieldErrors.subtitle}
        hint="One sentence on what the course helps someone do."
      />

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Description
        <textarea name="description" defaultValue={initial.description} rows={5} maxLength={5000} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
        <span className="text-xs font-normal text-text-secondary">What the course covers and who it is for. Separate paragraphs with a blank line.</span>
        {fieldErrors.description && <span role="alert" className="text-xs text-danger-text">{fieldErrors.description}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        What learners will achieve
        <textarea name="outcomes" defaultValue={initial.outcomes} rows={4} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
        <span className="text-xs font-normal text-text-secondary">One outcome per line, up to 8.</span>
        {fieldErrors.outcomes && <span role="alert" className="text-xs text-danger-text">{fieldErrors.outcomes}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Requirements
        <textarea name="requirements" defaultValue={initial.requirements} rows={3} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
        <span className="text-xs font-normal text-text-secondary">What learners should know or have first, one per line.</span>
        {fieldErrors.requirements && <span role="alert" className="text-xs text-danger-text">{fieldErrors.requirements}</span>}
      </label>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <Select
            label="Category"
            name="categorySlug"
            placeholder="No category"
            defaultValue={initial.categorySlug}
            disabled={busy}
            options={categories.map((c) => ({ value: c.slug, label: c.name }))}
          />
          {fieldErrors.categorySlug && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger-text">
              {fieldErrors.categorySlug}
            </p>
          )}
        </div>
        <div>
          <Select label="Level" name="level" defaultValue={initial.level} disabled={busy} options={LEVEL_OPTIONS} />
          {fieldErrors.level && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger-text">
              {fieldErrors.level}
            </p>
          )}
        </div>
        <div>
          <Select
            label="Language"
            name="language"
            defaultValue={initial.language}
            disabled={busy}
            options={LANGUAGE_OPTIONS}
          />
          {fieldErrors.language && (
            <p role="alert" className="mt-1 text-xs font-medium text-danger-text">
              {fieldErrors.language}
            </p>
          )}
        </div>
      </div>

      <fieldset className="space-y-2" disabled={busy}>
        <legend className="text-sm font-medium">Thumbnail</legend>
        {initial.thumbnailUrl && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded, remote storage host */}
            <img src={initial.thumbnailUrl} alt="Current course thumbnail" className="h-20 w-36 rounded-control border border-border object-cover" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="removeThumbnail" className="size-4 accent-primary" />
              Remove thumbnail
            </label>
          </div>
        )}
        <input
          type="file"
          name="thumbnail"
          aria-label="Upload thumbnail"
          accept="image/png,image/jpeg,image/webp"
          className="block w-full text-sm file:mr-3 file:rounded-control file:border file:border-border file:bg-surface file:px-3 file:py-2 file:text-sm"
        />
        <p className="text-xs text-text-secondary">PNG, JPEG or WebP, up to 2 MB. 16:9 works best.</p>
        {fieldErrors.thumbnail && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {fieldErrors.thumbnail}
          </p>
        )}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={submitting} disabled={disabled}>
          {mode === "create" ? "Create draft and continue" : "Save changes"}
        </Button>
        {mode === "create" && (
          <p className="text-sm text-text-secondary">Saved as a draft. You can leave and come back anytime.</p>
        )}
      </div>
    </form>
  );
}
