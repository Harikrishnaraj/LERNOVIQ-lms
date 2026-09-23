"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/features/auth/schemas";

export interface ForgotPasswordFormProps {
  onSubmit: (values: ForgotPasswordInput) => Promise<{ message: string } | { error: string }>;
}

export function ForgotPasswordForm({ onSubmit }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const result = forgotPasswordSchema.safeParse({ email });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setFieldError(null);

    setSubmitting(true);
    try {
      const outcome = await onSubmit(result.data);
      if ("error" in outcome) setFormError(outcome.error);
      else setSentMessage(outcome.message);
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sentMessage) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-light text-primary">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>
        <p className="text-sm text-text-secondary">{sentMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldError ?? undefined}
        disabled={submitting}
      />

      <Button type="submit" loading={submitting} className="mt-2">
        Send reset link
      </Button>
    </form>
  );
}
