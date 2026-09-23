"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GOAL_OPTIONS, INTEREST_OPTIONS } from "@/features/onboarding/options";
import type { OnboardingInput } from "@/features/onboarding/schemas";

export interface OnboardingFormProps {
  onSubmit: (values: OnboardingInput) => Promise<{ error: string } | void>;
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Choices({
  legend,
  options,
  selected,
  onToggle,
  disabled,
}: {
  legend: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-control border border-border bg-surface px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-light has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary"
          >
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.includes(o.value)}
              onChange={() => onToggle(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function OnboardingForm({ onSubmit }: OnboardingFormProps) {
  const [interests, setInterests] = useState<string[]>([]);
  const [goals, setGoals] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (interests.length === 0) {
      setError("Pick at least one interest.");
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await onSubmit({ interests, goals });
      if (outcome?.error) setError(outcome.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <Choices
        legend="What are you interested in?"
        options={INTEREST_OPTIONS}
        selected={interests}
        onToggle={(v) => setInterests((l) => toggle(l, v))}
        disabled={submitting}
      />
      <Choices
        legend="What do you want to achieve? (optional)"
        options={GOAL_OPTIONS}
        selected={goals}
        onToggle={(v) => setGoals((l) => toggle(l, v))}
        disabled={submitting}
      />
      <Button type="submit" loading={submitting}>
        Continue
      </Button>
    </form>
  );
}
