"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.email();

export async function resendVerification(email: string): Promise<{ error?: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data });

  if (error) {
    return { error: "We couldn't resend the email. Please try again shortly." };
  }
  return {};
}
