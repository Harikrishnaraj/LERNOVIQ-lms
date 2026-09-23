"use server";

import type { SignUpInput } from "./schemas";

// Supabase wiring + /verify-email redirect land in T-014.
export async function signUp(input: SignUpInput): Promise<{ error?: string } | void> {
  void input;
  return { error: "Sign-up isn't connected yet — lands in T-014." };
}
