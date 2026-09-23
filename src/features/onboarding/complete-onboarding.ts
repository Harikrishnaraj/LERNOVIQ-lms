"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema, type OnboardingInput } from "./schemas";

// Public endpoint: re-validate server-side and only write the caller own row
// (RLS enforces this too).
export async function completeOnboarding(
  input: OnboardingInput,
): Promise<{ error: string } | void> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: "Please log in again." };

  const { error } = await supabase.from("learner_onboarding").upsert({
    user_id: data.user.id,
    interests: parsed.data.interests,
    goals: parsed.data.goals,
    completed_at: new Date().toISOString(),
  });
  if (error) return { error: "We could not save your choices. Please try again." };

  redirect("/learner");
}
