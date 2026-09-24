import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, Clock } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  isUpcoming,
  listMyAssessments,
  type AssessmentListItem,
  type AssessmentStatus,
} from "@/features/assessments/list";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Assessments" };

const TABS = [
  { id: "upcoming", label: "Upcoming" },
  { id: "completed", label: "Completed" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const STATUS: Record<AssessmentStatus, { label: string; tone: BadgeTone; action: string }> = {
  not_started: { label: "Not started", tone: "neutral", action: "Start" },
  in_progress: { label: "In progress", tone: "warning", action: "Continue" },
  failed_retry: { label: "Not passed yet", tone: "danger", action: "Retry" },
  pending_review: { label: "Awaiting review", tone: "info", action: "View result" },
  passed: { label: "Passed", tone: "success", action: "View result" },
  failed_final: { label: "Not passed", tone: "danger", action: "View result" },
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

function AssessmentCard({ a }: { a: AssessmentListItem }) {
  const s = STATUS[a.status];
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{a.title}</h3>
          <p className="truncate text-sm text-text-secondary">{a.courseTitle}</p>
        </div>
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-secondary">Pass mark</dt>
        <dd>{a.passMark}%</dd>
        <dt className="text-text-secondary">Attempts</dt>
        <dd>
          {a.attemptsUsed}
          {a.maxAttempts !== null ? ` of ${a.maxAttempts}` : " (unlimited)"}
        </dd>
        {a.timeLimitMinutes !== null && (
          <>
            <dt className="text-text-secondary">Time limit</dt>
            <dd>{a.timeLimitMinutes} min</dd>
          </>
        )}
        {a.bestPercent !== null && (
          <>
            <dt className="text-text-secondary">Best score</dt>
            <dd>{a.bestPercent}%</dd>
            <dt className="text-text-secondary">Latest</dt>
            <dd>
              {a.lastPercent}%
              {a.lastSubmittedAt ? ` · ${dateFormat.format(new Date(a.lastSubmittedAt))}` : ""}
            </dd>
          </>
        )}
      </dl>
      <div>
        <Link
          href={`/learner/courses/${a.courseSlug}/assessments/${a.id}`}
          className={buttonClasses({
            size: "sm",
            variant: isUpcoming(a.status) ? "primary" : "secondary",
          })}
        >
          {s.action}
          <span className="sr-only"> {a.title}</span>
        </Link>
      </div>
    </Card>
  );
}

export default async function LearnerAssessmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabId = TABS.find((t) => t.id === rawTab)?.id ?? "upcoming";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const all = await listMyAssessments(supabase, user!.id);
  const upcoming = all.filter((a) => isUpcoming(a.status));
  const completed = all.filter((a) => !isUpcoming(a.status));
  const shown = tab === "upcoming" ? upcoming : completed;
  const counts: Record<TabId, number> = { upcoming: upcoming.length, completed: completed.length };

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Quizzes and exams across your courses, with your results."
      />

      <nav aria-label="Assessment sections" className="mb-6 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "upcoming" ? "/learner/assessments" : `/learner/assessments?tab=${t.id}`}
            aria-current={t.id === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              t.id === tab
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-text",
            )}
          >
            {t.label} <span className="text-text-muted">({counts[t.id]})</span>
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        tab === "upcoming" ? (
          <EmptyState
            icon={ClipboardCheck}
            title={all.length === 0 ? "No assessments yet" : "Nothing left to take"}
            description={
              all.length === 0
                ? "Quizzes and exams from the courses you enroll in will show up here."
                : "You have no assessments waiting. Check Completed for your results."
            }
            action={
              <Link href="/learner/my-learning" className={buttonClasses({ variant: "secondary" })}>
                Go to My Learning
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={completed.length === 0 && all.length > 0 ? Clock : CheckCircle2}
            title="No results yet"
            description="Finished assessments and your scores will be listed here."
          />
        )
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((a) => (
            <li key={a.id}>
              <AssessmentCard a={a} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
