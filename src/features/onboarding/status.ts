import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasCompletedOnboarding(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("learner_onboarding")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data !== null;
}
