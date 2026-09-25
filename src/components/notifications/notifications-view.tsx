import Link from "next/link";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ItemControls, MarkAllReadButton, PreferenceToggle } from "@/components/notifications/notification-controls";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PAGE_SIZE,
  getPreferences,
  listNotifications,
} from "@/features/notifications/notifications";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** The notifications list, filters and preferences for one portal (learner or instructor). */
export async function NotificationsView({
  portal,
  userId,
  searchParams,
}: {
  portal: "learner" | "instructor";
  userId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const unreadOnly = one(searchParams.filter) === "unread";
  const pageNumber = Number.parseInt(one(searchParams.page), 10);
  const page = Number.isFinite(pageNumber) && pageNumber > 0 && pageNumber < 10_000 ? pageNumber : 1;

  const supabase = await createClient();
  const [{ items, total }, prefs] = await Promise.all([listNotifications(supabase, { unreadOnly, page }), getPreferences(supabase, userId)]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const base = `/${portal}/notifications`;
  const href = (over: { filter?: string; page?: number }) => {
    const params = new URLSearchParams();
    const f = over.filter ?? (unreadOnly ? "unread" : "all");
    if (f === "unread") params.set("filter", "unread");
    if ((over.page ?? page) > 1) params.set("page", String(over.page ?? page));
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const anyUnread = items.some((n) => !n.read) || unreadOnly;

  return (
    <>
      <PageHeader title="Notifications" description="Updates about your courses, work and discussions." actions={<MarkAllReadButton disabled={!anyUnread} />} />

      <nav aria-label="Filter notifications" className="mb-4 flex gap-1 border-b border-border">
        {[
          { id: "all", label: "All" },
          { id: "unread", label: "Unread" },
        ].map((f) => (
          <Link
            key={f.id}
            href={href({ filter: f.id, page: 1 })}
            aria-current={(f.id === "unread") === unreadOnly ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              (f.id === "unread") === unreadOnly ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={unreadOnly ? "You are all caught up" : "No notifications yet"}
          description={unreadOnly ? "There is nothing unread." : "Updates will appear here as things happen in your courses."}
        />
      ) : (
        <>
          <ul aria-label="Notifications" className="divide-y divide-border-subtle rounded-card border border-border bg-surface">
            {items.map((n) => (
              <li key={n.id} className={cn("space-y-1 p-4", !n.read && "bg-primary-light/40")}>
                <div className="flex flex-wrap items-center gap-2">
                  {!n.read && (
                    <Badge tone="primary" dot>
                      Unread
                    </Badge>
                  )}
                  <Badge tone="neutral">{CATEGORY_LABEL[n.category].label}</Badge>
                  <span className="text-xs text-text-secondary">{dateTime.format(new Date(n.createdAt))} UTC</span>
                </div>
                <p className="text-sm font-semibold">
                  {n.href ? (
                    <Link href={n.href} className="hover:underline">
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                </p>
                {n.body && <p className="text-sm text-text-secondary">{n.body}</p>}
                <ItemControls id={n.id} read={n.read} title={n.title} />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {page > 1 ? (
                <Link href={href({ page: page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={href({ page: page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Older
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      <section aria-labelledby="prefs-heading" className="mt-10 max-w-2xl">
        <h2 id="prefs-heading" className="text-base font-semibold">
          Notification preferences
        </h2>
        <p className="mb-2 text-sm text-text-secondary">Choose which in-app notifications you receive. Email delivery is not available yet.</p>
        <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface px-4">
          {CATEGORIES.map((c) => (
            <PreferenceToggle key={c} category={c} label={CATEGORY_LABEL[c].label} description={CATEGORY_LABEL[c].description} initial={prefs[c]} />
          ))}
        </ul>
      </section>
    </>
  );
}
