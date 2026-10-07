import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getPortalPathForUser } from "@/features/auth/roles";

// Logged-in visitors go straight to their portal — the public marketing
// site (course catalog, pricing, etc.) is a later phase.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(await getPortalPathForUser(supabase, user.id));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-card bg-primary text-white">
        <GraduationCap className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight md:text-4xl">
        One platform. Three workspaces built for the job.
      </h1>
      <p className="mt-3 max-w-lg text-text-secondary">
        Learn, teach and operate learning — all in LERNOVIQ.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/courses" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Browse courses
        </Link>
        <Link href="/signup" className={buttonClasses({ size: "lg" })}>
          Sign up
        </Link>
        <Link href="/login" className={buttonClasses({ variant: "secondary", size: "lg" })}>
          Log in
        </Link>
      </div>
    </main>
  );
}
