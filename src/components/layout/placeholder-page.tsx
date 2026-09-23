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

  return (
    <>
      <PageHeader title={item.label} description={item.description} />
      <EmptyState
        icon={Construction}
        title={`Coming in ${item.task}`}
        description={`This screen is built by ${item.task} in docs/TASKS.md. The route and navigation are in place.`}
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
