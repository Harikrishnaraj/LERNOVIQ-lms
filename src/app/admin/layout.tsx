import type { Metadata } from "next";
import { PortalShell } from "@/components/layout/portal-shell";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Modern LMS" },
};

// TODO(T-019): server-side auth + role guard for /admin before any real data is rendered here.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="admin">{children}</PortalShell>;
}
