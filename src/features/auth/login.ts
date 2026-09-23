"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginInput } from "./schemas";
import { getPortalPathForUser } from "./roles";

// Only redirect to a same-origin relative path the middleware itself set
// (?next=) — never follow an attacker-supplied absolute/protocol-relative
// URL (open redirect).
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// Never trust the client: re-validate here even though LoginForm already
// validated, since a Server Action is a public endpoint callable directly.
// `next` is bound by the page from ?next= (see LoginPage), not form input.
export async function login(
  next: string | null,
  input: LoginInput,
): Promise<{ error?: string } | void> {
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

  redirect(safeNext(next) ?? (await getPortalPathForUser(supabase, data.user.id)));
}
