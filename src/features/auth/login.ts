"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginInput } from "./schemas";

// Never trust the client: re-validate here even though LoginForm already
// validated, since a Server Action is a public endpoint callable directly.
export async function login(input: LoginInput): Promise<{ error?: string } | void> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Please check your details and try again." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  // One generic message for both a wrong password and an unknown email —
  // distinguishing them would let an attacker enumerate registered emails.
  if (error) {
    return { error: "Invalid email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", data.user.id)
    .single();

  if (profile?.status === "suspended") {
    await supabase.auth.signOut();
    return { error: "Your account has been suspended. Contact support." };
  }

  // Role-aware redirect lands in T-018.
  redirect("/");
}
