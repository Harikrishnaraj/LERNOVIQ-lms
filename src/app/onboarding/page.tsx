import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { OnboardingForm } from "@/components/forms/onboarding-form";
import { completeOnboarding } from "@/features/onboarding/complete-onboarding";
import { hasCompletedOnboarding } from "@/features/onboarding/status";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Welcome" };

// Outside /learner so the learner layout onboarding redirect cannot loop.
// Requires a signed-in user.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=%2Fonboarding");
  if (await hasCompletedOnboarding(supabase, data.user.id)) redirect("/learner");

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader
          title="Let's personalise your learning"
          description="Tell us what you are into so we can recommend the right courses."
        />
        <CardContent>
          <OnboardingForm onSubmit={completeOnboarding} />
        </CardContent>
      </Card>
    </main>
  );
}
