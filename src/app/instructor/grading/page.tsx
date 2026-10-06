import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  filterQueue,
  getGradingQueue,
  parseAssignmentFilter,
  parseQueueFilter,
  type QueueFilter,
} from "@/features/assignments/grading";
import {
  filterAttemptQueue,
  getAttemptGradingQueue,
  parseGradingKind,
  type GradingKind,
} from "@/features/assessments/manual-grading";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Grading" };

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const TABS: { id: QueueFilter; label: string }[] = [
  { id: "pending", label: "To grade" },
  { id: "graded", label: "Graded" },
  { id: "all", label: "All" },
];
const tabClass = (active: boolean) =>
  cn(
    "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
    active
      ? "border-primary text-primary"
      : "border-transparent text-text-secondary hover:text-text",
  );

export default async function GradingQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const kind = parseGradingKind(sp.kind);
  const filter = parseQueueFilter(sp.filter);
  const assignment = kind === "assignments" ? parseAssignmentFilter(sp.assignment) : null;
  const supabase = await createClient();
  const [all, attempts] = await Promise.all([
    getGradingQueue(supabase),
    getAttemptGradingQueue(supabase),
  ]);
  const scoped = assignment ? all.filter((r) => r.assignmentId === assignment) : all;
  const rows = filterQueue(all, filter, assignment);
  const attemptRows = filterAttemptQueue(attempts, filter);
  const pending = scoped.filter((r) => r.status !== "graded").length;
  const pendingAttempts = attempts.filter((r) => r.status !== "graded").length;
  const scopedTitle = assignment ? (scoped[0]?.assignmentTitle ?? "This assignment") : null;
  const tabHref = (id: QueueFilter) => {
    const q = new URLSearchParams();
    if (kind === "assessments") q.set("kind", "assessments");
    if (assignment) q.set("assignment", assignment);
    if (id !== "pending") q.set("filter", id);
    const s = q.toString();
    return s ? `/instructor/grading?${s}` : "/instructor/grading";
  };
  const kindHref = (k: GradingKind) =>
    k === "assessments" ? "/instructor/grading?kind=assessments" : "/instructor/grading";
  const description =
    kind === "assessments"
      ? `${pendingAttempts} ${pendingAttempts === 1 ? "assessment attempt" : "assessment attempts"} waiting for a grade.`
      : `${pending} ${pending === 1 ? "submission" : "submissions"} waiting for a grade.`;

  return (
    <>
      <PageHeader title="Grading" description={description} />
      <nav aria-label="What to grade" className="mb-3 flex flex-wrap gap-2">
        {(["assignments", "assessments"] as const).map((k) => (
          <Link
            key={k}
            href={kindHref(k)}
            aria-current={k === kind ? "page" : undefined}
            className={cn(
              "rounded-control border px-3 py-1.5 text-sm font-medium",
              k === kind
                ? "border-primary bg-primary-light text-primary"
                : "border-border text-text-secondary hover:text-text",
            )}
          >
            {k === "assignments"
              ? `Assignments (${pending} to grade)`
              : `Essay & coding answers (${pendingAttempts} to grade)`}
          </Link>
        ))}
      </nav>
      {scopedTitle && (
        <p className="mb-3 text-sm text-text-secondary">
          Showing submissions for <span className="font-medium text-text">{scopedTitle}</span>.{" "}
          <Link
            href={
              filter === "pending" ? "/instructor/grading" : `/instructor/grading?filter=${filter}`
            }
            className="text-primary underline"
          >
            Show every assignment
          </Link>
        </p>
      )}
      <nav aria-label="Filter submissions" className="mb-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={tabHref(t.id)}
            aria-current={t.id === filter ? "page" : undefined}
            className={tabClass(t.id === filter)}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {kind === "assessments" ? (
        attemptRows.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={filter === "pending" ? "No answers to grade" : "No attempts here"}
            description={
              filter === "pending"
                ? "Attempts with essay or coding questions show up here once learners submit them."
                : "Try another tab."
            }
          />
        ) : (
          <ul aria-label="Assessment attempts" className="space-y-2">
            {attemptRows.map((r) => (
              <li
                key={r.attemptId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    <Link
                      href={`/instructor/grading/attempts/${r.attemptId}`}
                      className="hover:underline"
                    >
                      {r.assessmentTitle}
                    </Link>
                    <span className="font-normal text-text-secondary"> · {r.learnerName}</span>
                  </p>
                  <p className="text-xs text-text-secondary">
                    {r.courseTitle} · attempt {r.attemptNumber} · submitted{" "}
                    {dateTime.format(new Date(r.submittedAt))} UTC
                  </p>
                </div>
                {r.status === "graded" ? (
                  <Badge tone={r.passed ? "success" : "danger"} dot>
                    Graded {r.percent ?? 0}% · {r.passed ? "Passed" : "Not passed"}
                  </Badge>
                ) : (
                  <Badge tone="info" dot>
                    To grade
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={filter === "pending" ? "Nothing to grade" : "No submissions here"}
          description={
            filter === "pending"
              ? "New submissions from your learners will show up here."
              : "Try another tab."
          }
        />
      ) : (
        <ul aria-label="Submissions" className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.submissionId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
            >
              <div className="min-w-0">
                <p className="font-semibold">
                  <Link href={`/instructor/grading/${r.submissionId}`} className="hover:underline">
                    {r.assignmentTitle}
                  </Link>
                  <span className="font-normal text-text-secondary"> · {r.learnerName}</span>
                </p>
                <p className="text-xs text-text-secondary">
                  {r.courseTitle} · submitted {dateTime.format(new Date(r.submittedAt))} UTC
                </p>
              </div>
              <div className="flex items-center gap-2">
                {r.isLate && <Badge tone="warning">Late</Badge>}
                {r.status === "graded" ? (
                  <Badge tone="success" dot>
                    Graded {r.grade}/{r.maxPoints}
                  </Badge>
                ) : (
                  <Badge tone="info" dot>
                    To grade
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
