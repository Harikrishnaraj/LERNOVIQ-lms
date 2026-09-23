"use server";

import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema, type ForgotPasswordInput } from "./schemas";

const GENERIC_MESSAGE = "If that email has an account, we sent a password reset link.";

// Never trust the client: re-validate here even though the form already
// validated, since a Server Action is a public endpoint callable directly.
// Always returns the same generic message on a well-formed email — whether
// or not that email is registered — to avoid enumeration.
export async function forgotPassword(
  input: ForgotPasswordInput,
): Promise<{ message: string } | { error: string }> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  if (!(await rateLimit("password-reset", await clientIp(), parsed.data.email))) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
  });

  // Supabase doesn't error for an unregistered email (its own
  // anti-enumeration behavior) — an error here is a real problem (e.g. rate
  // limited), safe to surface since it doesn't depend on account existence.
  if (error) {
    return { error: "We couldn't send the reset email. Please try again shortly." };
  }

  return { message: GENERIC_MESSAGE };
}
