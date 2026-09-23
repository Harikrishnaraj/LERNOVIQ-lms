"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ResendVerificationButtonProps {
  email: string;
  onResend: (email: string) => Promise<{ error?: string }>;
}

export function ResendVerificationButton({ email, onResend }: ResendVerificationButtonProps) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setState("sending");
    setError(null);
    const result = await onResend(email);
    if (result.error) {
      setError(result.error);
      setState("idle");
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-success-text">
        <CheckCircle2 className="size-4" aria-hidden="true" />
        Email resent — check your inbox.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="secondary" loading={state === "sending"} onClick={handleClick}>
        Resend verification email
      </Button>
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
