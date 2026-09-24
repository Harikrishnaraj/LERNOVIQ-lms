"use client";

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MAX_OPTIONS,
  QUESTION_TYPES,
  TRUE_FALSE_LABELS,
  validateQuestion,
  type QuestionInput,
} from "@/features/course-authoring/assessment-rules";
import type { AuthoringQuestion } from "@/features/course-authoring/assessments";

type Opt = { label: string; correct: boolean };

const blankOptions = (): Opt[] => [
  { label: "", correct: true },
  { label: "", correct: false },
];
const trueFalse = (correctIndex: number): Opt[] => TRUE_FALSE_LABELS.map((label, i) => ({ label, correct: i === correctIndex }));

const field = "w-full rounded-input border border-border bg-surface px-3 py-2 text-sm";

export function QuestionEditor({
  initial,
  disabled,
  onSave,
  onCancel,
}: {
  initial: AuthoringQuestion | null;
  disabled: boolean;
  onSave: (input: QuestionInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }>;
  onCancel: () => void;
}) {
  const [type, setType] = useState<string>(initial?.type ?? "mcq");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [points, setPoints] = useState(String(initial?.points ?? 1));
  const [options, setOptions] = useState<Opt[]>(
    initial && initial.options.length > 0 ? initial.options.map((o) => ({ label: o.label, correct: o.correct })) : blankOptions(),
  );
  const [accepted, setAccepted] = useState((initial?.acceptedAnswers ?? []).join("\n"));
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function changeType(next: string) {
    setType(next);
    setErrors({});
    if (next === "true_false") setOptions(trueFalse(0));
    else if ((type === "true_false" || type === "short_answer" || type === "essay" || type === "coding") && (next === "mcq" || next === "multi")) {
      setOptions(blankOptions());
    }
  }

  function setCorrect(index: number, checked: boolean) {
    setOptions((prev) =>
      prev.map((o, i) => (type === "multi" ? (i === index ? { ...o, correct: checked } : o) : { ...o, correct: i === index })),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const input: QuestionInput = {
      type,
      prompt,
      points: Number(points),
      options: type === "mcq" || type === "multi" || type === "true_false" ? options : [],
      acceptedAnswers: type === "short_answer" ? accepted.split("\n") : [],
      explanation,
    };
    const check = validateQuestion(input); // instant feedback; the server validates again
    if (!check.ok) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await onSave(input);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
      }
    } catch {
      setFormError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || disabled;
  const hasOptions = type === "mcq" || type === "multi";
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-card border border-primary bg-surface p-4" aria-label={initial ? "Edit question" : "New question"}>
      {formError && (
        <p role="alert" className="text-sm font-medium text-danger-text">
          {formError}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Question type
          <select value={type} onChange={(e) => changeType(e.target.value)} disabled={busy} className={field}>
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Points
          <input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(e.target.value)} disabled={busy} className={field} />
          {errors.points && <span role="alert" className="text-xs text-danger-text">{errors.points}</span>}
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Question
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={5000} disabled={busy} className={field} />
        {errors.prompt && <span role="alert" className="text-xs text-danger-text">{errors.prompt}</span>}
      </label>

      {hasOptions && (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-sm font-medium">
            Answer options <span className="font-normal text-text-secondary">({type === "multi" ? "tick every correct answer" : "select the correct answer"})</span>
          </legend>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={type === "multi" ? "checkbox" : "radio"}
                name="correct-option"
                aria-label={`Option ${i + 1} is correct`}
                checked={o.correct}
                onChange={(e) => setCorrect(i, e.target.checked)}
                className="size-4 accent-primary"
              />
              <input
                aria-label={`Option ${i + 1} text`}
                value={o.label}
                maxLength={1000}
                onChange={(e) => setOptions((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                className={field}
              />
              <button
                type="button"
                aria-label={`Remove option ${i + 1}`}
                disabled={options.length <= 2}
                onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle disabled:opacity-40"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setOptions((p) => [...p, { label: "", correct: false }])}>
              <Plus className="size-4" aria-hidden="true" />
              Add option
            </Button>
          )}
          {errors.options && <p role="alert" className="text-xs text-danger-text">{errors.options}</p>}
        </fieldset>
      )}

      {type === "true_false" && (
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="text-sm font-medium">The statement is</legend>
          {TRUE_FALSE_LABELS.map((label, i) => (
            <label key={label} className="flex items-center gap-2 text-sm">
              <input type="radio" name="tf" checked={options[i]?.correct ?? false} onChange={() => setOptions(trueFalse(i))} className="size-4 accent-primary" />
              {label}
            </label>
          ))}
          {errors.options && <p role="alert" className="text-xs text-danger-text">{errors.options}</p>}
        </fieldset>
      )}

      {type === "short_answer" && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Accepted answers <span className="font-normal text-text-secondary">(one per line; capitals and extra spaces are ignored)</span>
          <textarea value={accepted} onChange={(e) => setAccepted(e.target.value)} rows={3} disabled={busy} className={field} />
          {errors.acceptedAnswers && <span role="alert" className="text-xs text-danger-text">{errors.acceptedAnswers}</span>}
        </label>
      )}

      {(type === "essay" || type === "coding") && (
        <p className="rounded-control bg-info-light p-3 text-sm text-info-text">
          {type === "essay" ? "Essays" : "Coding answers"} are graded by hand after the learner submits, so there is no answer key.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium">
        Explanation <span className="font-normal text-text-secondary">(optional; shown to learners after they pass or use all attempts)</span>
        <textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={2} maxLength={2000} disabled={busy} className={field} />
      </label>

      <div className="flex gap-2">
        <Button type="submit" loading={saving} disabled={disabled}>
          {initial ? "Save question" : "Add question"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
