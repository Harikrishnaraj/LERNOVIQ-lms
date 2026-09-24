"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, CheckCircle2, Pencil, Plus, Trash2 } from "lucide-react";
import { QuestionEditor } from "@/components/course-authoring/question-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  deleteAssessment,
  deleteQuestion,
  reorderQuestions,
  saveQuestion,
  updateAssessmentSettings,
  type AssessmentResult,
} from "@/features/course-authoring/assessment-actions";
import { QUESTION_TYPES, summarizeQuestions } from "@/features/course-authoring/assessment-rules";
import type { AuthoringAssessment } from "@/features/course-authoring/assessments";
import { moveBy } from "@/features/course-authoring/ordering";

const iconBtn =
  "inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary";
const field = "h-10 w-full rounded-input border border-border bg-surface px-3 text-sm";

export function AssessmentBuilder({
  courseId,
  assessment,
  disabled = false,
}: {
  courseId: string;
  assessment: AuthoringAssessment;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [confirming, setConfirming] = useState<string | "assessment" | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // settings form state
  const [title, setTitle] = useState(assessment.title);
  const [description, setDescription] = useState(assessment.description);
  const [passMark, setPassMark] = useState(String(assessment.passMark));
  const [unlimited, setUnlimited] = useState(assessment.maxAttempts === null);
  const [attempts, setAttempts] = useState(String(assessment.maxAttempts ?? 3));
  const [timed, setTimed] = useState(assessment.timeLimitMinutes !== null);
  const [minutes, setMinutes] = useState(String(assessment.timeLimitMinutes ?? 30));

  const locked = busy || disabled;
  const ids = assessment.questions.map((q) => q.id);
  const summary = summarizeQuestions(assessment.questions);

  async function run(action: () => Promise<AssessmentResult>, success?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const r = await action();
      if (r.ok) {
        setErrors({});
        if (success) setNotice({ tone: "ok", text: success });
        setConfirming(null);
        router.refresh();
      } else {
        setErrors(r.fieldErrors ?? {});
        setNotice({ tone: "error", text: r.error });
      }
      return r;
    } catch {
      setNotice({ tone: "error", text: "Something went wrong. Please try again." });
      return { ok: false, error: "Something went wrong." } as AssessmentResult;
    } finally {
      setBusy(false);
    }
  }

  function saveSettings(e: FormEvent) {
    e.preventDefault();
    void run(
      () =>
        updateAssessmentSettings(courseId, assessment.id, {
          title,
          description,
          passMark: Number(passMark),
          maxAttempts: unlimited ? null : Number(attempts),
          timeLimitMinutes: timed ? Number(minutes) : null,
        }),
      "Settings saved.",
    );
  }

  return (
    <div className="space-y-8">
      <div aria-live="polite" className="min-h-6">
        {notice && (
          <p role={notice.tone === "error" ? "alert" : "status"} className={`text-sm font-medium ${notice.tone === "error" ? "text-danger-text" : "text-success-text"}`}>
            {notice.text}
          </p>
        )}
      </div>

      <form onSubmit={saveSettings} noValidate className="max-w-2xl space-y-4" aria-label="Assessment settings">
        <h2 className="text-lg font-semibold">Settings</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={locked} className={field} />
          {errors.title && <span role="alert" className="text-xs text-danger-text">{errors.title}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} disabled={locked} className="w-full rounded-input border border-border bg-surface px-3 py-2 text-sm" />
        </label>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Pass mark (%)
            <input type="number" min={0} max={100} value={passMark} onChange={(e) => setPassMark(e.target.value)} disabled={locked} className={field} />
            {errors.passMark && <span role="alert" className="text-xs text-danger-text">{errors.passMark}</span>}
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium">
            <label htmlFor="max-attempts">Attempts allowed</label>
            <input id="max-attempts" type="number" min={1} max={20} value={attempts} onChange={(e) => setAttempts(e.target.value)} disabled={locked || unlimited} className={field} />
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} disabled={locked} className="size-4 accent-primary" />
              Unlimited attempts
            </label>
            {errors.maxAttempts && <span role="alert" className="text-xs text-danger-text">{errors.maxAttempts}</span>}
          </div>
          <div className="flex flex-col gap-1 text-sm font-medium">
            <label htmlFor="time-limit">Time limit (minutes)</label>
            <input id="time-limit" type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={locked || !timed} className={field} />
            <label className="flex items-center gap-2 font-normal">
              <input type="checkbox" checked={timed} onChange={(e) => setTimed(e.target.checked)} disabled={locked} className="size-4 accent-primary" />
              Enforce a time limit
            </label>
            {errors.timeLimitMinutes && <span role="alert" className="text-xs text-danger-text">{errors.timeLimitMinutes}</span>}
          </div>
        </div>
        <Button type="submit" loading={busy} disabled={disabled}>
          Save settings
        </Button>
      </form>

      <section aria-labelledby="questions-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="questions-heading" className="text-lg font-semibold">
              Questions
            </h2>
            <p className="text-sm text-text-secondary">
              {summary.count} {summary.count === 1 ? "question" : "questions"} · {summary.totalPoints} points
              {summary.manualCount > 0 ? ` · ${summary.manualCount} graded by hand` : ""}
            </p>
          </div>
          <Button type="button" onClick={() => setEditingId("new")} disabled={locked || editingId !== null}>
            <Plus className="size-4" aria-hidden="true" />
            Add question
          </Button>
        </div>

        {assessment.questions.length === 0 && editingId !== "new" && (
          <p className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-text-secondary">
            No questions yet. Add the first one; learners cannot take an empty assessment.
          </p>
        )}

        <ol className="space-y-3">
          {assessment.questions.map((q, i) =>
            editingId === q.id ? (
              <li key={q.id}>
                <QuestionEditor
                  initial={q}
                  disabled={disabled}
                  onCancel={() => setEditingId(null)}
                  onSave={async (input) => {
                    const r = await saveQuestion(courseId, assessment.id, q.id, input);
                    if (r.ok) {
                      setEditingId(null);
                      setNotice({ tone: "ok", text: "Question saved." });
                      router.refresh();
                    }
                    return r;
                  }}
                />
              </li>
            ) : (
              <li key={q.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {i + 1}. {q.prompt}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <Badge tone="neutral">{QUESTION_TYPES.find((t) => t.value === q.type)?.label}</Badge>
                      {q.points} {q.points === 1 ? "point" : "points"}
                    </p>
                    {q.options.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {q.options.map((o) => (
                          <li key={o.id} className="flex items-center gap-2">
                            {o.correct ? (
                              <>
                                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                                <span className="sr-only">Correct: </span>
                              </>
                            ) : (
                              <span className="size-4" aria-hidden="true" />
                            )}
                            {o.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.acceptedAnswers.length > 0 && (
                      <p className="mt-2 text-sm text-text-secondary">Accepted: {q.acceptedAnswers.join(", ")}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center">
                    <button type="button" className={iconBtn} aria-label={`Edit question ${i + 1}`} disabled={locked || editingId !== null} onClick={() => setEditingId(q.id)}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={iconBtn} aria-label={`Move question ${i + 1} up`} disabled={locked || i === 0} onClick={() => void run(() => reorderQuestions(courseId, assessment.id, moveBy(ids, q.id, -1)))}>
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </button>
                    <button type="button" className={iconBtn} aria-label={`Move question ${i + 1} down`} disabled={locked || i === ids.length - 1} onClick={() => void run(() => reorderQuestions(courseId, assessment.id, moveBy(ids, q.id, 1)))}>
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </button>
                    {confirming === q.id ? (
                      <span role="alertdialog" aria-label={`Confirm deleting question ${i + 1}`} className="ml-1 inline-flex items-center gap-1">
                        <Button type="button" size="sm" variant="destructive" disabled={locked} onClick={() => void run(() => deleteQuestion(courseId, assessment.id, q.id), "Question deleted.")}>
                          Delete question
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)}>Keep</Button>
                      </span>
                    ) : (
                      <button type="button" className={iconBtn} aria-label={`Delete question ${i + 1}`} disabled={locked} onClick={() => setConfirming(q.id)}>
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ),
          )}
          {editingId === "new" && (
            <li>
              <QuestionEditor
                initial={null}
                disabled={disabled}
                onCancel={() => setEditingId(null)}
                onSave={async (input) => {
                  const r = await saveQuestion(courseId, assessment.id, null, input);
                  if (r.ok) {
                    setEditingId(null);
                    setNotice({ tone: "ok", text: "Question added." });
                    router.refresh();
                  }
                  return r;
                }}
              />
            </li>
          )}
        </ol>
      </section>

      <section aria-labelledby="danger-heading" className="border-t border-border pt-6">
        <h2 id="danger-heading" className="mb-2 text-base font-semibold">
          Delete assessment
        </h2>
        {confirming === "assessment" ? (
          <div role="alertdialog" aria-label="Confirm deleting this assessment" className="flex flex-wrap items-center gap-2">
            <p className="text-sm">Delete this assessment and all its questions?</p>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={locked}
              onClick={async () => {
                const r = await run(() => deleteAssessment(courseId, assessment.id));
                if (r.ok) router.push(`/instructor/courses/${courseId}/assessments`);
              }}
            >
              Yes, delete assessment
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
          </div>
        ) : (
          <Button type="button" variant="secondary" disabled={locked} onClick={() => setConfirming("assessment")}>
            <Trash2 className="size-4" aria-hidden="true" />
            Delete assessment
          </Button>
        )}
      </section>
    </div>
  );
}
