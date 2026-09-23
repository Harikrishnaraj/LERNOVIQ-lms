import type { SupabaseClient } from "@supabase/supabase-js";

// True when the session has NOT passed a second factor (AAL2). Fails closed:
// any error reading the assurance level counts as "not verified".
export async function needsMfa(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return true;
  return data.currentLevel !== "aal2";
}

// Same-origin relative paths only (open-redirect guard).
export function safeNextPath(next: string | null | undefined, fallback = "/admin"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return fallback;
  return next;
}
