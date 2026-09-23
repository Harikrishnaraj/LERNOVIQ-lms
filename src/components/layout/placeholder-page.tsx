import Link from "next/link";
import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { NAVIGATION, allNavItems, findNavItem } from "@/config/navigation";
import type { Portal } from "@/types/portal";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";

/**
 * Temporary screen for routes whose feature is not built yet.
 * Shows no fake data (ADR-023) — only what the screen is for and which task builds it.
 * Replace by adding an explicit route file (e.g. app/learner/my-learning/page.tsx).
 */
export function PlaceholderPage({ portal, href }: { portal: Portal; href: string }) {
  const item = findNavItem(portal, href);
  if (!item) notFound();

  const deferred = item.task === "later";
  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <EmptyState
        icon={Construction}
        title={deferred ? "Planned for a later phase" : `Coming in ${item.task}`}
        description={
          deferred
            ? "This area is deferred until the core learning loop is stable (ADR-025)."
            : `This screen is scheduled in docs/TASKS.md as ${item.task}. The route and navigation are in place.`
        }
        action={
          href !== NAVIGATION[portal].home ? (
            <Link
              href={NAVIGATION[portal].home}
              className={buttonClasses({ variant: "secondary" })}
            >
              Back to {NAVIGATION[portal].label.toLowerCase()} home
            </Link>
          ) : undefined
        }
      />
    </>
  );
}

/** Static params for a portal's catch-all placeholder route. */
export function placeholderParams(portal: Portal): { section: string[] }[] {
  const home = NAVIGATION[portal].home;
  return allNavItems(portal)
    .filter((i) => i.href !== home)
    .map((i) => ({ section: i.href.slice(home.length + 1).split("/") }));
}
