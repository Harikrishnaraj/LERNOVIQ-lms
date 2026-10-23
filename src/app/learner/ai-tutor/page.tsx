import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceholderPage } from "@/components/layout/placeholder-page";
import { AI_TUTOR_HREF, aiTutorHiddenFor } from "@/config/feature-access";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "AI Tutor" };

// Its own route (not the [...section] placeholder) so it can check who is asking: accounts with the
// AI Tutor switched off get a 404 even if they type the URL (src/config/feature-access.ts).
export default async function AiTutorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (aiTutorHiddenFor(user?.email)) notFound();
  return <PlaceholderPage portal="learner" href={AI_TUTOR_HREF} />;
}
