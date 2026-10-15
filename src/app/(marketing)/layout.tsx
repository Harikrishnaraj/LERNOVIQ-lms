import { SiteShell } from "@/components/marketing/site-shell";

// Public marketing site (ADR-042): the design export's header and footer, and Plus Jakarta Sans
// for all text as in the export.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      <main id="main" className="font-display">
        {children}
      </main>
    </SiteShell>
  );
}
