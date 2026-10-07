import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { getPortalPathForUser } from "@/features/auth/roles";
import { createClient } from "@/lib/supabase/server";

/** Header for public (signed-out friendly) pages: catalog, course detail, certificate verify. */
export async function PublicHeader() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const portalHref = user ? await getPortalPathForUser(supabase, user.id) : null;

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2.5 rounded-control">
          <span className="flex size-9 items-center justify-center rounded-control bg-primary text-white">
            <GraduationCap className="size-5" aria-hidden="true" />
          </span>
          <span className="font-display text-[15px] font-bold">LERNOVIQ</span>
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2">
          <Link href="/courses" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Courses
          </Link>
          {portalHref ? (
            <Link href={portalHref} className={buttonClasses({ size: "sm" })}>
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Log in
              </Link>
              <Link href="/signup" className={buttonClasses({ size: "sm" })}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
