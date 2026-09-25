import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { MessageStudentForm } from "@/components/instructor/message-student-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MESSAGE_MAX, getStudentDetail } from "@/features/instructor/student-detail";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Student" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const STATE_LABEL = { completed: "Completed", in_progress: "In progress", not_started: "Not started" } as const;
const STATE_TONE = { completed: "success", in_progress: "info", not_started: "neutral" } as const;

export default async function StudentDetailPage({ params }: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const s = await getStudentDetail(supabase, enrollmentId);
  if (!s) notFound();

  return (
    <>
      <Link href="/instructor/students" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Students
      </Link>
      <PageHeader
        title={s.name}
        description={`${s.courseTitle} · version ${s.versionNumber} · enrolled ${dateTime.format(new Date(s.enrolledAt))}`}
        actions={s.completedAt ? <Badge tone="success" dot>Completed</Badge> : undefined}
      />

      <div className="space-y-8">
        <section aria-labelledby="lessons-heading" className="max-w-3xl space-y-3">
          <h2 id="lessons-heading" className="text-base font-semibold">Progress by lesson</h2>
          <Progress value={s.percent} label={`${s.name} progress`} />
          <p className="text-sm text-text-secondary">{s.completedLessons}/{s.lessons.length} lessons · {s.percent}%</p>
          {s.lessons.length === 0 ? (
            <p className="text-sm text-text-secondary">This course version has no lessons yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface">
              {s.lessons.map((l) => (
                <li key={l.lessonId} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    <span className="block font-medium">{l.title}</span>
                    <span className="text-xs text-text-secondary">{l.section}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {l.completedAt && <span className="text-xs text-text-secondary">{dateTime.format(new Date(l.completedAt))}</span>}
                    <Badge tone={STATE_TONE[l.state]}>{STATE_LABEL[l.state]}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="attempts-heading" className="max-w-3xl space-y-3">
          <h2 id="attempts-heading" className="text-base font-semibold">Assessment attempts</h2>
          {s.attempts.length === 0 ? (
            <p className="text-sm text-text-secondary">No assessment attempts yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface">
              {s.attempts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span className="font-medium">{a.assessmentTitle} · attempt {a.attemptNumber}</span>
                  {a.percent === null ? (
                    <Badge tone="neutral">In progress</Badge>
                  ) : (
                    <Badge tone={a.passed ? "success" : "warning"}>{a.percent}% · {a.passed ? "Passed" : "Not passed"}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="subs-heading" className="max-w-3xl space-y-3">
          <h2 id="subs-heading" className="text-base font-semibold">Assignment submissions</h2>
          {s.submissions.length === 0 ? (
            <p className="text-sm text-text-secondary">No submissions yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-card border border-border bg-surface">
              {s.submissions.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <Link href={`/instructor/grading/${x.id}`} className="font-medium text-primary underline">{x.assignmentTitle}</Link>
                  <span className="flex items-center gap-2">
                    {x.isLate && <Badge tone="warning">Late</Badge>}
                    {x.status === "graded" ? <Badge tone="success">Graded {x.grade}/{x.maxPoints}</Badge> : <Badge tone="info">Awaiting grade</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="msg-heading" className="space-y-3">
          <h2 id="msg-heading" className="text-base font-semibold">Message {s.name}</h2>
          <MessageStudentForm enrollmentId={s.enrollmentId} max={MESSAGE_MAX} />
        </section>
      </div>
    </>
  );
}
