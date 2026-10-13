import type { SupabaseClient } from "@supabase/supabase-js";

// Per-user AI Tutor access (T-206, ADR-043): read side for the admin user detail page.

export interface AiTutorAccess {
  enabled: boolean;
  grantedAt: string | null;
  grantedByName: string | null;
}

/** Reads through RLS: the user themself, or admins with ai.manage_access / user.read_all. */
export async function getAiTutorAccess(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiTutorAccess> {
  const { data } = await supabase
    .from("ai_tutor_access")
    .select("granted_at, granted_by_profile:profiles!ai_tutor_access_granted_by_fkey(full_name)")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { enabled: false, grantedAt: null, grantedByName: null };
  const grantedBy = data.granted_by_profile as unknown as { full_name: string | null } | null;
  return {
    enabled: true,
    grantedAt: data.granted_at as string,
    grantedByName: grantedBy?.full_name ?? null,
  };
}
