import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1">
        <Link href="/" className="rounded-control">
          {/* Brand guide §5: the compact secondary mark on small screens, the primary lockup from md up. */}
          <BrandLogo variant="secondary" width={96} className="md:hidden" />
          <BrandLogo width={120} className="hidden md:inline-block" />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center justify-end gap-2">
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
