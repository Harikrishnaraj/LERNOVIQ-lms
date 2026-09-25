import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  EyeOff,
  HelpCircle,
  MessageSquare,
  MessagesSquare,
  Pin,
  ShieldAlert,
  ThumbsUp,
} from "lucide-react";
import {
  InstructorModerateButton,
  InstructorPinButton,
  InstructorResolveReportButton,
} from "@/components/discussions/instructor-controls";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  filterInstructorDiscussions,
  getInstructorDiscussionReports,
  getInstructorDiscussions,
  INSTRUCTOR_FILTERS,
  type InstructorDiscussionFilter,
} from "@/features/instructor/discussions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Discussions · Instructor" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function InstructorDiscussionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = (INSTRUCTOR_FILTERS.find((f) => f.id === one(raw.filter))?.id ?? "unanswered") as InstructorDiscussionFilter;
  const course = one(raw.course).slice(0, 100);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [threads, reports] = await Promise.all([
    getInstructorDiscussions(supabase),
    getInstructorDiscussionReports(supabase),
  ]);

  const shown = filterInstructorDiscussions(threads, filter, course);
  const courseOptions = [...new Map(threads.map((t) => [t.courseSlug, t.courseTitle])).entries()];

  const unansweredCount = threads.filter((t) => !t.answered && !t.hidden).length;
  const pinnedCount = threads.filter((t) => t.pinned).length;
  const openReportsCount = reports.length;

  const href = (over: { filter?: InstructorDiscussionFilter; course?: string }) => {
    const f = over.filter ?? filter;
    const c = over.course ?? course;
    const params = new URLSearchParams();
    if (f !== "unanswered") params.set("filter", f);
    if (c) params.set("course", c);
    const qs = params.toString();
    return qs ? `/instructor/discussions?${qs}` : "/instructor/discussions";
  };

  return (
    <>
      <PageHeader
        title="Discussions"
        description="Answer questions across your courses and manage forum moderation."
      />

      {/* KPI summaries */}
      <section aria-label="Discussions summary" className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Needs Reply</span>
            <HelpCircle className="size-4 text-warning-text" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-text">{unansweredCount}</p>
          <p className="text-xs text-text-secondary">Unanswered learner questions</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Pinned Topics</span>
            <Pin className="size-4 text-primary" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-text">{pinnedCount}</p>
          <p className="text-xs text-text-secondary">Important course announcements</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-secondary">Moderation Queue</span>
            <ShieldAlert className="size-4 text-danger-text" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-text">{openReportsCount}</p>
          <p className="text-xs text-text-secondary">Open reports requiring review</p>
        </Card>
      </section>

      {/* Filter and course navigation */}
      <nav aria-label="Filter discussions" className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
        {INSTRUCTOR_FILTERS.map((f) => {
          const count =
            f.id === "unanswered"
              ? unansweredCount
              : f.id === "reported"
                ? openReportsCount
                : f.id === "answered"
                  ? threads.filter((t) => t.answered && !t.hidden).length
                  : threads.length;
          return (
            <Link
              key={f.id}
              href={href({ filter: f.id })}
              aria-current={f.id === filter ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium",
                f.id === filter
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text",
              )}
            >
              <span>{f.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs",
                  f.id === filter ? "bg-primary-light text-primary font-semibold" : "bg-border-subtle text-text-secondary",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}

        {courseOptions.length > 1 && (
          <form method="get" action="/instructor/discussions" className="ml-auto flex items-center gap-2 pb-1">
            {filter !== "unanswered" && <input type="hidden" name="filter" value={filter} />}
            <label className="text-sm">
              <span className="sr-only">Filter by Course</span>
              <select
                name="course"
                defaultValue={course}
                className="h-9 rounded-input border border-border bg-surface px-2 text-sm"
              >
                <option value="">All my courses</option>
                {courseOptions.map(([slug, title]) => (
                  <option key={slug} value={slug}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-control border border-border px-3 py-1.5 text-sm hover:bg-border-subtle">
              Apply
            </button>
          </form>
        )}
      </nav>

      {/* Moderation queue view */}
      {filter === "reported" && reports.length > 0 ? (
        <section aria-labelledby="reports-heading" className="space-y-3">
          <h2 id="reports-heading" className="sr-only">Reported Items</h2>
          <ul aria-label="Reported items queue" className="space-y-3">
            {reports.map((r) => (
              <li key={r.reportId} className="rounded-card border border-danger/30 bg-danger-light/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="danger">Reported {r.targetType}</Badge>
                      <span className="text-xs text-text-secondary font-medium">{r.courseTitle}</span>
                      {r.targetHidden && <Badge tone="warning">Currently hidden</Badge>}
                    </div>
                    <p className="text-sm font-medium text-danger-text">Reason: &ldquo;{r.reason}&rdquo;</p>
                    <p className="line-clamp-2 text-sm text-text-secondary italic bg-surface p-2 rounded border border-border">
                      &ldquo;{r.targetPreview}&rdquo;
                    </p>
                    <p className="text-xs text-text-secondary">
                      By {r.targetAuthorName} · Reported by {r.reporterName} on {dateFormat.format(new Date(r.reportedAt))}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <InstructorResolveReportButton
                      type={r.targetType}
                      id={r.targetId}
                      discussionId={r.discussionId}
                    />
                    <InstructorModerateButton
                      type={r.targetType}
                      id={r.targetId}
                      hidden={r.targetHidden}
                      discussionId={r.discussionId}
                    />
                    <Link
                      href={`/instructor/discussions/${r.discussionId}`}
                      className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-border-subtle"
                    >
                      View in thread
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={filter === "reported" ? ShieldAlert : filter === "unanswered" ? CheckCircle2 : MessagesSquare}
          title={
            filter === "unanswered"
              ? "All caught up!"
              : filter === "reported"
                ? "No reported content"
                : threads.length === 0
                  ? "No discussions yet"
                  : "No discussions match"
          }
          description={
            filter === "unanswered"
              ? "Every question in your courses currently has a reply or answer."
              : filter === "reported"
                ? "There are no open reports requiring moderation in your courses."
                : threads.length === 0
                  ? "When enrolled learners ask questions in your courses, they will appear here."
                  : "Try clearing your course or status filter."
          }
        />
      ) : (
        <ul aria-label="Instructor discussions queue" className="space-y-3">
          {shown.map((t) => (
            <li
              key={t.id}
              className={cn(
                "rounded-card border bg-surface p-4 transition-colors",
                t.hidden ? "border-danger/40 bg-danger-light/10" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 max-w-2xl space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {t.courseTitle}
                    </span>
                    {t.pinned && (
                      <span className="inline-flex items-center gap-1 rounded bg-primary-light px-2 py-0.5 text-xs font-medium text-primary">
                        <Pin className="size-3" aria-hidden="true" /> Pinned
                      </span>
                    )}
                    {t.hidden && (
                      <span className="inline-flex items-center gap-1 rounded bg-danger-light px-2 py-0.5 text-xs font-medium text-danger-text">
                        <EyeOff className="size-3" aria-hidden="true" /> Hidden from learners
                      </span>
                    )}
                    {t.openReports > 0 && (
                      <span className="inline-flex items-center gap-1 rounded bg-danger-light px-2 py-0.5 text-xs font-semibold text-danger-text">
                        <AlertTriangle className="size-3" aria-hidden="true" /> {t.openReports} report{t.openReports === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>

                  <h2 className="text-base font-semibold">
                    <Link href={`/instructor/discussions/${t.id}`} className="hover:underline">
                      {t.title}
                    </Link>
                  </h2>
                  <p className="line-clamp-2 text-sm text-text-secondary">{t.body}</p>
                  <p className="text-xs text-text-secondary">
                    Asked by {t.authorName} · {dateFormat.format(new Date(t.createdAt))}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-3">
                  <div className="flex items-center gap-3 text-xs text-text-secondary">
                    {t.answered ? (
                      <span className="inline-flex items-center gap-1 font-medium text-success-text">
                        <CheckCircle2 className="size-4" aria-hidden="true" /> Answered
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-warning-text">
                        <Clock className="size-4" aria-hidden="true" /> Unanswered
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <ThumbsUp className="size-3.5" aria-hidden="true" /> {t.votes}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="size-3.5" aria-hidden="true" /> {t.replies} {t.replies === 1 ? "reply" : "replies"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <InstructorPinButton discussionId={t.id} pinned={t.pinned} variant="button" />
                    <InstructorModerateButton
                      type="thread"
                      id={t.id}
                      hidden={t.hidden}
                      discussionId={t.id}
                    />
                    <Link
                      href={`/instructor/discussions/${t.id}`}
                      className="rounded-control bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover"
                    >
                      {t.replies === 0 ? "Reply now" : "View thread"}
                    </Link>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
