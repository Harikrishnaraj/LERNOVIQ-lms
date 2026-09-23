"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signUpSchema, type SignUpInput } from "./schemas";

// Never trust the client: re-validate here even though SignUpForm already
// validated, since a Server Action is a public endpoint callable directly.
export async function signUp(input: SignUpInput): Promise<{ error?: string } | void> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });

  if (error) {
    return { error: "We couldn't create your account. Please try again." };
  }

  // Supabase returns success (no error) for an already-registered email too,
  // rather than revealing which emails exist — this redirect covers both.
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}
