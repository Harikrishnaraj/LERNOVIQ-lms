import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AttemptView, ResultQuestion } from "@/features/assessments/state";

function labelFor(q: ResultQuestion, id: string) {
  return q.options.find((o) => o.id === id)?.label ?? "(removed option)";
}

function describeAnswer(q: ResultQuestion): string {
  const a = q.yourAnswer;
  if (a === null || a === "" || (Array.isArray(a) && a.length === 0)) return "No answer";
  if (Array.isArray(a)) return a.map((id) => labelFor(q, id)).join(", ");
  if (q.type === "mcq" || q.type === "true_false" || q.type === "multi") return labelFor(q, a);
  return a;
}

export function AssessmentResult({
  attempt,
  passMark,
  questions,
  revealed,
  score,
  maxScore,
  attemptsUsed,
  maxAttempts,
}: {
  attempt: AttemptView;
  passMark: number;
  questions: ResultQuestion[];
  revealed: boolean;
  score: number;
  maxScore: number;
  attemptsUsed: number;
  maxAttempts: number | null;
}) {
  const pending = attempt.status === "submitted";
  return (
    <section aria-labelledby="result-heading" className="space-y-4">
      <Card className="space-y-2 p-5">
        <h2 id="result-heading" className="text-lg font-semibold">
          Attempt {attempt.number} result
        </h2>
        <p className="text-3xl font-bold">{attempt.percent ?? 0}%</p>
        <p className="text-sm text-text-secondary">
          {score} of {maxScore} points · pass mark {passMark}% · attempt {attemptsUsed}
          {maxAttempts !== null ? ` of ${maxAttempts}` : ""}
        </p>
        {pending ? (
          <Badge tone="warning" dot>
            Awaiting instructor review
          </Badge>
        ) : attempt.passed ? (
          <Badge tone="success" dot>
            Passed
          </Badge>
        ) : (
          <Badge tone="danger" dot>
            Not passed
          </Badge>
        )}
      </Card>

      {!revealed && (
        <p className="text-sm text-text-secondary">
          Correct answers are shown once you pass or use all your attempts.
        </p>
      )}

      <ol className="space-y-3">
        {questions.map((q, i) => (
          <li key={q.id}>
            <Card className="space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">
                  {i + 1}. {q.prompt}
                </p>
                {q.correct === null ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm text-warning-text">
                    <Clock className="size-4" aria-hidden="true" /> Pending review
                  </span>
                ) : q.correct ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm text-success-text">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> Correct
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm text-danger-text">
                    <XCircle className="size-4" aria-hidden="true" /> Incorrect
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary">
                Your answer: <span className="text-text">{describeAnswer(q)}</span>
              </p>
              {revealed && q.correctOptionIds && q.correctOptionIds.length > 0 && (
                <p className="text-sm text-text-secondary">
                  Correct answer:{" "}
                  <span className="text-text">
                    {q.correctOptionIds.map((id) => labelFor(q, id)).join(", ")}
                  </span>
                </p>
              )}
              {revealed && q.acceptedAnswers && q.acceptedAnswers.length > 0 && (
                <p className="text-sm text-text-secondary">
                  Accepted answers: <span className="text-text">{q.acceptedAnswers.join(", ")}</span>
                </p>
              )}
              {revealed && q.explanation && (
                <p className="text-sm text-text-secondary">{q.explanation}</p>
              )}
            </Card>
          </li>
        ))}
      </ol>
    </section>
  );
}
