import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, PlusCircle, SearchX, Star, Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  STATUS_FILTERS,
  countByFilter,
  filterCourses,
  getInstructorCourses,
  parseStatusFilter,
  type StatusFilterId,
} from "@/features/instructor/courses";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { formatPrice } from "@/lib/utils/format";

export const metadata: Metadata = { title: "My Courses" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function href(status: StatusFilterId, q: string) {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/instructor/courses?${qs}` : "/instructor/courses";
}

export default async function MyCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const raw = await searchParams;
  const status = parseStatusFilter(raw.status);
  const q = (raw.q ?? "").trim().slice(0, 100);

  const all = await getInstructorCourses(await createClient());
  const counts = countByFilter(all);
  const shown = filterCourses(all, { status, q });

  return (
    <>
      <PageHeader
        title="My Courses"
        description="Everything you have created, by status."
        actions={
          <Link href="/instructor/courses/new" className={buttonClasses()}>
            <PlusCircle className="size-4" aria-hidden="true" />
            Create course
          </Link>
        }
      />

      <nav aria-label="Course status" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.id}
            href={href(f.id, q)}
            aria-current={f.id === status ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              f.id === status
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {f.label} <span className="text-text-muted">({counts[f.id]})</span>
          </Link>
        ))}
      </nav>

      <form method="get" action="/instructor/courses" role="search" className="mb-6 flex items-end gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <div className="max-w-sm flex-1">
          <Input label="Search your courses" type="search" name="q" defaultValue={q} maxLength={100} />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {all.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="You have not created a course yet"
          description="Start with the basics. Your progress saves as a draft at every step."
          action={
            <Link href="/instructor/courses/new" className={buttonClasses()}>
              Create your first course
            </Link>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No courses match"
          description="Try another status or search term."
          action={
            <Link href="/instructor/courses" className={buttonClasses({ variant: "secondary" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((c) => (
            <li key={c.courseId}>
              <Card className="flex h-full flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      <Link href={`/instructor/courses/${c.courseId}`} className="hover:underline">
                        {c.title}
                      </Link>
                    </h2>
                    {c.subtitle && <p className="truncate text-sm text-text-secondary">{c.subtitle}</p>}
                  </div>
                  <StatusBadge kind="course" status={c.status} />
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <dt className="text-text-secondary">Version</dt>
                  <dd>
                    v{c.versionNumber}
                    {c.isLive ? " · live for learners" : ""}
                  </dd>
                  <dt className="text-text-secondary">Price</dt>
                  <dd>{formatPrice(c.priceCents, c.currency)}</dd>
                  <dt className="text-text-secondary">Updated</dt>
                  <dd>{dateFormat.format(new Date(c.updatedAt))}</dd>
                </dl>
                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary">
                  <span className="inline-flex items-center gap-3">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-4" aria-hidden="true" />
                      {c.learners} {c.learners === 1 ? "learner" : "learners"}
                    </span>
                    {c.ratingCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="size-4 fill-warning text-warning" aria-hidden="true" />
                        {c.ratingAvg.toFixed(1)}
                      </span>
                    )}
                  </span>
                  <Link
                    href={`/instructor/courses/${c.courseId}`}
                    className={buttonClasses({ size: "sm", variant: "secondary" })}
                  >
                    Manage<span className="sr-only"> {c.title}</span>
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
