"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gradeAssessmentAttempt } from "@/features/assessments/grading-actions";
import { MAX_OVERALL_FEEDBACK, MAX_QUESTION_FEEDBACK } from "@/features/assessments/grading";

export interface GradeFormQuestion {
  id: string;
  number: number;
  type: "essay" | "coding";
  prompt: string;
  points: number;
  answer: string;
  initialPoints: number | null;
  initialFeedback: string;
}

const textArea = "rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal";

/** Scores the essay/coding questions of one attempt (T-252). Learner answers are plain text. */
export function AttemptGradeForm({
  attemptId,
  passMark,
  autoEarned,
  autoMax,
  questions,
  initialOverall,
  regrading,
}: {
  attemptId: string;
  passMark: number;
  autoEarned: number;
  autoMax: number;
  questions: GradeFormQuestion[];
  initialOverall: string;
  regrading: boolean;
}) {
  const router = useRouter();
  const [points, setPoints] = useState<Record<string, string>>(
    Object.fromEntries(
      questions.map((q) => [q.id, q.initialPoints === null ? "" : String(q.initialPoints)]),
    ),
  );
  const [feedback, setFeedback] = useState<Record<string, string>>(
    Object.fromEntries(questions.map((q) => [q.id, q.initialFeedback])),
  );
  const [overall, setOverall] = useState(initialOverall);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const max = autoMax + questions.reduce((n, q) => n + q.points, 0);
  const total = autoEarned + questions.reduce((n, q) => n + (Number(points[q.id]) || 0), 0);
  const complete = questions.every((q) => points[q.id] !== "");
  const percent = max > 0 ? Math.round((total / max) * 10000) / 100 : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const numeric: Record<string, number> = {};
    for (const q of questions)
      numeric[q.id] = points[q.id] === "" ? Number.NaN : Number(points[q.id]);
    const r = await gradeAssessmentAttempt(attemptId, { points: numeric, feedback, overall });
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error });
      return;
    }
    setNotice({
      tone: "ok",
      text: `Grade saved: ${r.percent}%, ${r.passed ? "passed" : "not passed"}. The learner was notified.${r.courseCompleted ? " They have now completed the course." : ""}`,
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Grade this attempt" className="space-y-5">
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
              : "flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"
          }
        >
          {notice.tone === "error" ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          {notice.text}
        </div>
      )}

      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-3 text-base font-semibold">Graded by you</legend>
        {questions.map((q) => (
          <div key={q.id} className="space-y-3 rounded-card border border-border bg-surface p-4">
            <p className="text-sm font-medium">
              {q.number}. {q.prompt}
              <span className="font-normal text-text-secondary">
                {" "}
                · {q.type === "coding" ? "Coding" : "Essay"}
              </span>
            </p>
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">Learner&apos;s answer</p>
              {q.answer ? (
                <p
                  className={
                    q.type === "coding"
                      ? "max-h-96 overflow-auto rounded-input bg-border-subtle p-3 font-mono text-sm whitespace-pre-wrap"
                      : "max-h-96 overflow-auto rounded-input bg-border-subtle p-3 text-sm whitespace-pre-wrap"
                  }
                >
                  {q.answer}
                </p>
              ) : (
                <p className="text-sm text-text-secondary">No answer.</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Input
                label={`Points for question ${q.number} (out of ${q.points})`}
                type="number"
                min={0}
                max={q.points}
                step={1}
                value={points[q.id]}
                onChange={(e) => setPoints((prev) => ({ ...prev, [q.id]: e.target.value }))}
              />
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                Feedback on question {q.number} (optional)
                <textarea
                  value={feedback[q.id]}
                  onChange={(e) => setFeedback((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  rows={2}
                  maxLength={MAX_QUESTION_FEEDBACK}
                  className={textArea}
                />
              </label>
            </div>
          </div>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Overall feedback for the learner (optional)
        <textarea
          value={overall}
          onChange={(e) => setOverall(e.target.value)}
          rows={4}
          maxLength={MAX_OVERALL_FEEDBACK}
          disabled={busy}
          className={textArea}
        />
      </label>

      <p className="text-sm font-medium" aria-live="polite">
        {complete
          ? `Total: ${total} / ${max} points · ${percent}% · ${percent >= passMark ? "passes" : "does not pass"} (pass mark ${passMark}%)`
          : `Score every question to see the result (pass mark ${passMark}%).`}
      </p>
      <Button type="submit" loading={busy}>
        {regrading ? "Update grade" : "Save grade"}
      </Button>
    </form>
  );
}
