import type { Metadata } from "next";
import { PortalShell } from "@/components/layout/portal-shell";
import { logout } from "@/features/auth/logout";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { default: "Instructor", template: "%s · Instructor · Modern LMS" },
};

// Middleware (src/middleware.ts) already redirects unauthenticated requests
// to /login. TODO(T-019): role/permission guard on top of "is logged in".
export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PortalShell portal="instructor" user={user && { email: user.email! }} onLogout={logout}>
      {children}
    </PortalShell>
  );
}
