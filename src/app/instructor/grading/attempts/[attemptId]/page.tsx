import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, XCircle } from "lucide-react";
import { AttemptGradeForm } from "@/components/assessments/attempt-grade-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  getAttemptForGrading,
  getAttemptGradingQueue,
} from "@/features/assessments/manual-grading";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Grade attempt" };

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function GradeAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await getAttemptForGrading(supabase, user.id, attemptId);
  if (!ctx) notFound();
  const queue = await getAttemptGradingQueue(supabase);
  const learner = queue.find((r) => r.attemptId === ctx.attempt.id)?.learnerName ?? "A learner";

  const auto = ctx.questions.filter((q) => !q.manual);
  const manual = ctx.questions.filter((q) => q.manual);
  const autoEarned = auto.reduce((n, q) => n + q.earned, 0);
  const autoMax = auto.reduce((n, q) => n + q.points, 0);
  const graded = ctx.attempt.status === "graded";
  const submitted = ctx.attempt.submitted_at
    ? `submitted ${dateTime.format(new Date(ctx.attempt.submitted_at))} UTC`
    : "submitted";

  return (
    <>
      <Link
        href="/instructor/grading?kind=assessments"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Grading queue
      </Link>
      <PageHeader
        title={ctx.assessmentTitle}
        description={`${learner} · attempt ${ctx.attempt.attempt_number} · ${submitted}`}
        actions={
          graded ? (
            <Badge tone={ctx.attempt.passed ? "success" : "danger"} dot>
              Graded {Number(ctx.attempt.percent ?? 0)}% ·{" "}
              {ctx.attempt.passed ? "Passed" : "Not passed"}
            </Badge>
          ) : (
            <Badge tone="info" dot>
              To grade
            </Badge>
          )
        }
      />

      <div className="max-w-3xl space-y-6">
        {auto.length > 0 && (
          <section aria-labelledby="auto-heading" className="space-y-3">
            <h2 id="auto-heading" className="text-base font-semibold">
              Graded automatically · {autoEarned} / {autoMax} points
            </h2>
            <ol className="space-y-2">
              {auto.map((q) => (
                <li key={q.id}>
                  <Card className="space-y-1 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium">
                        {ctx.questions.indexOf(q) + 1}. {q.prompt}
                      </p>
                      {q.correct ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm text-success-text">
                          <CheckCircle2 className="size-4" aria-hidden="true" /> {q.earned} /{" "}
                          {q.points}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm text-danger-text">
                          <XCircle className="size-4" aria-hidden="true" /> 0 / {q.points}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-text-secondary">
                      Answer: <span className="text-text">{q.answer || "No answer"}</span>
                    </p>
                  </Card>
                </li>
              ))}
            </ol>
          </section>
        )}

        <AttemptGradeForm
          attemptId={ctx.attempt.id}
          passMark={ctx.passMark}
          autoEarned={autoEarned}
          autoMax={autoMax}
          questions={manual.map((q) => ({
            id: q.id,
            number: ctx.questions.indexOf(q) + 1,
            type: q.type === "coding" ? "coding" : "essay",
            prompt: q.prompt,
            points: q.points,
            answer: q.answer,
            initialPoints: q.manualPoints,
            initialFeedback: q.manualFeedback,
          }))}
          initialOverall={ctx.attempt.feedback ?? ""}
          regrading={graded}
        />
      </div>
    </>
  );
}
