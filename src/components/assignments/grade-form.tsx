"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gradeSubmission } from "@/features/assignments/grading-actions";

export function GradeForm({
  submissionId,
  maxPoints,
  criteria,
  initialScores,
  initialGrade,
  initialFeedback,
  regrading,
}: {
  submissionId: string;
  maxPoints: number;
  criteria: { id: string; title: string; description: string; maxPoints: number }[];
  initialScores: Record<string, number>;
  initialGrade: number | null;
  initialFeedback: string;
  regrading: boolean;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>(
    Object.fromEntries(criteria.map((c) => [c.id, initialScores[c.id] !== undefined ? String(initialScores[c.id]) : ""])),
  );
  const [grade, setGrade] = useState(initialGrade === null ? "" : String(initialGrade));
  const [feedback, setFeedback] = useState(initialFeedback);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const total = criteria.reduce((n, c) => n + (Number(scores[c.id]) || 0), 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const numeric: Record<string, number> = {};
    for (const c of criteria) numeric[c.id] = scores[c.id] === "" ? Number.NaN : Number(scores[c.id]);
    const r = await gradeSubmission(submissionId, {
      scores: numeric,
      grade: grade === "" ? null : Number(grade),
      feedback,
    });
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error });
      return;
    }
    setNotice({ tone: "ok", text: "Grade saved and the learner was notified." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Grade this submission" className="max-w-2xl space-y-5">
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={notice.tone === "error" ? "flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text" : "flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"}
        >
          {notice.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {notice.text}
        </div>
      )}
      {criteria.length > 0 ? (
        <fieldset disabled={busy} className="space-y-3">
          <legend className="text-base font-semibold">Rubric</legend>
          {criteria.map((c) => (
            <div key={c.id} className="grid items-end gap-2 rounded-card border border-border p-3 sm:grid-cols-[1fr_9rem]">
              <div>
                <p className="text-sm font-medium">{c.title}</p>
                {c.description && <p className="text-xs text-text-secondary">{c.description}</p>}
              </div>
              <Input
                label={`Score for ${c.title} (out of ${c.maxPoints})`}
                type="number"
                min={0}
                max={c.maxPoints}
                value={scores[c.id]}
                onChange={(e) => setScores((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-sm font-medium">
            Total: {total} / {maxPoints}
          </p>
        </fieldset>
      ) : (
        <Input label={`Grade (out of ${maxPoints})`} type="number" min={0} max={maxPoints} value={grade} onChange={(e) => setGrade(e.target.value)} disabled={busy} />
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Feedback for the learner
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={5} maxLength={10000} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
      </label>
      <Button type="submit" loading={busy}>
        {regrading ? "Update grade" : "Save grade"}
      </Button>
    </form>
  );
}
