import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/layout/portal-shell";
import { logout } from "@/features/auth/logout";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/can";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Modern LMS" },
};

// src/proxy.ts already redirects unauthenticated/unpermitted requests before
// this ever renders; this check is defense-in-depth (a proxy matcher change
// or a route reached another way must not silently drop the guard).
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await can(supabase, user.id, "portal.admin.access"))) redirect("/permission-denied");

  return (
    <PortalShell portal="admin" user={user && { email: user.email! }} onLogout={logout}>
      {children}
    </PortalShell>
  );
}
