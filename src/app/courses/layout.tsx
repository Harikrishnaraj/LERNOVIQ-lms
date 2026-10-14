import { SiteShell } from "@/components/marketing/site-shell";

// The catalogue and course pages share the marketing site's header and footer (ADR-042, T-262).
export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
