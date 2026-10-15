import type { ReactNode } from "react";
import { getPortalPathForUser } from "@/features/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { BackToTop } from "./back-to-top";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

// Header + footer of the public site (ADR-042). Signed-in visitors get "Go to dashboard" instead of
// Log in / Sign up, as the old catalogue header did.
export async function SiteShell({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const portalHref = user ? await getPortalPathForUser(supabase, user.id) : null;

  return (
    <div className="min-h-dvh bg-surface text-text">
      <SiteHeader portalHref={portalHref} />
      {children}
      <SiteFooter />
      <BackToTop />
    </div>
  );
}
