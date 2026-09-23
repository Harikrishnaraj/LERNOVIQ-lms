import type { Metadata } from "next";
import { PortalShell } from "@/components/layout/portal-shell";

export const metadata: Metadata = {
  title: { default: "Instructor", template: "%s · Instructor · Modern LMS" },
};

// TODO(T-019): server-side auth + role guard for /instructor before any real data is rendered here.
export default function InstructorLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="instructor">{children}</PortalShell>;
}
