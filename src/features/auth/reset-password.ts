"use server";

import { redirect } from "next/navigation";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema, type ResetPasswordInput } from "./schemas";

// Requires the recovery session established by /auth/callback after the
// user clicks the emailed link — updateUser() acts on the current session.
export async function resetPassword(input: ResetPasswordInput): Promise<{ error?: string }> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }

  if (!(await rateLimit("password-reset", await clientIp()))) {
    return { error: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { error: "We couldn't reset your password. Please request a new reset link." };
  }

  redirect("/login");
}
