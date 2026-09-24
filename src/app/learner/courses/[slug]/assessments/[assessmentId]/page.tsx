import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AssessmentResult } from "@/components/assessments/assessment-result";
import { AssessmentRunner } from "@/components/assessments/assessment-runner";
import { StartAttemptButton } from "@/components/assessments/start-attempt-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { saveAnswers, startAttempt, submitAttempt } from "@/features/assessments/attempts";
import { getAssessmentPageState } from "@/features/assessments/state";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessment" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AssessmentPage({
  params,
}: {
  params: Promise<{ slug: string; assessmentId: string }>;
}) {
  const { slug, assessmentId } = await params;
  if (!UUID.test(assessmentId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = await getAssessmentPageState(supabase, user.id, slug, assessmentId);
  if (!state) notFound();
  const { assessment, inProgress, latest, result, start, attempts } = state;

  const attemptsLabel =
    assessment.maxAttempts === null
      ? "Unlimited attempts"
      : `${attempts.length} of ${assessment.maxAttempts} attempts used`;

  return (
    <div className="min-h-dvh bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href={`/learner/courses/${slug}`}
          className="inline-flex items-center gap-1 rounded-control text-sm text-text-secondary hover:text-text"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Back to course
        </Link>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{assessment.title}</p>
      </header>

      <main id="main" className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{assessment.title}</h1>
          {assessment.description && (
            <p className="text-text-secondary">{assessment.description}</p>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="neutral">{assessment.questions.length} questions</Badge>
            <Badge tone="neutral">Pass mark {assessment.passMark}%</Badge>
            {assessment.timeLimitMinutes !== null && (
              <Badge tone="neutral">{assessment.timeLimitMinutes} min time limit</Badge>
            )}
            <Badge tone="neutral">{attemptsLabel}</Badge>
          </div>
        </div>

        {inProgress ? (
          <AssessmentRunner
            assessment={assessment}
            initialAnswers={inProgress.answers}
            expiresAt={inProgress.expiresAt}
            onSave={saveAnswers.bind(null, assessmentId, inProgress.id)}
            onSubmit={submitAttempt.bind(null, assessmentId, inProgress.id)}
          />
        ) : (
          <>
            {latest && result && (
              <AssessmentResult
                attempt={latest}
                passMark={assessment.passMark}
                questions={result.questions}
                revealed={result.revealed}
                score={result.score}
                maxScore={result.maxScore}
                attemptsUsed={attempts.length}
                maxAttempts={assessment.maxAttempts}
              />
            )}

            {start.ok ? (
              <Card className="space-y-3 p-5">
                <p className="text-sm text-text-secondary">
                  {latest
                    ? "You can try again. Your best effort is what counts, so take your time."
                    : assessment.timeLimitMinutes !== null
                      ? `The timer starts as soon as you begin and you have ${assessment.timeLimitMinutes} minutes.`
                      : "Answer every question, then submit."}
                </p>
                <StartAttemptButton
                  label={latest ? "Retry assessment" : "Start assessment"}
                  onStart={startAttempt.bind(null, assessmentId)}
                />
              </Card>
            ) : (
              start.reason === "no_attempts_left" && (
                <p role="status" className="text-sm text-text-secondary">
                  You have used all your attempts for this assessment.
                </p>
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
