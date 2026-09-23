import type { Metadata } from "next";
import { PortalShell } from "@/components/layout/portal-shell";

export const metadata: Metadata = {
  title: { default: "Learner", template: "%s · Learner · Modern LMS" },
};

// TODO(T-019): server-side auth + role guard for /learner before any real data is rendered here.
export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell portal="learner">{children}</PortalShell>;
}
