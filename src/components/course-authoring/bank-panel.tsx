"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { QUESTION_TYPES } from "@/features/course-authoring/assessment-rules";
import { importFromBank, saveQuestionToBank } from "@/features/question-bank/actions";
import type { BankItem } from "@/features/question-bank/bank";

const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.value === t)?.label.split(" (")[0] ?? t;

/** Import questions from the instructor bank into this assessment, or save one of its questions to the bank. */
export function BankPanel({
  courseId,
  assessmentId,
  bankItems,
  questions,
  disabled,
}: {
  courseId: string;
  assessmentId: string;
  bankItems: BankItem[];
  questions: { id: string; prompt: string }[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickedId, setSaveId] = useState("");
  // The picked question, or the first one when nothing valid is picked (the list changes after imports).
  const saveId = questions.some((q) => q.id === pickedId) ? pickedId : (questions[0]?.id ?? "");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function doImport() {
    setBusy(true);
    setNotice(null);
    const r = await importFromBank(courseId, assessmentId, [...selected]);
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error });
      return;
    }
    setSelected(new Set());
    setNotice({ tone: "ok", text: `Imported ${r.imported} ${r.imported === 1 ? "question" : "questions"}.` });
    router.refresh();
  }

  async function doSave() {
    setBusy(true);
    setNotice(null);
    const r = await saveQuestionToBank(courseId, assessmentId, saveId, tags);
    setBusy(false);
    if (!r.ok) {
      setNotice({ tone: "error", text: r.fieldErrors?.tags ?? r.error });
      return;
    }
    setNotice({ tone: "ok", text: "Saved to your question bank." });
    setTags("");
    router.refresh();
  }

  return (
    <section aria-labelledby="bank-heading" className="mt-10 max-w-3xl space-y-6 rounded-card border border-border bg-surface p-5">
      <h2 id="bank-heading" className="text-base font-semibold">
        Question bank
      </h2>
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={notice.tone === "error" ? "text-sm text-danger-text" : "text-sm text-success-text"}>
          {notice.text}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Import into this assessment</h3>
        {bankItems.length === 0 ? (
          <p className="text-sm text-text-secondary">Your bank is empty. Add questions on the Question Bank page.</p>
        ) : (
          <>
            <ul aria-label="Bank questions" className="max-h-64 space-y-1 overflow-y-auto">
              {bankItems.map((i) => (
                <li key={i.id}>
                  <label className="flex items-start gap-2 rounded-control p-2 text-sm hover:bg-border-subtle">
                    <input type="checkbox" className="mt-0.5 size-4" checked={selected.has(i.id)} onChange={() => toggle(i.id)} disabled={disabled || busy} />
                    <span className="min-w-0">
                      <span className="block">{i.prompt}</span>
                      <span className="block text-xs text-text-secondary">
                        {typeLabel(i.type)} · {i.points} {i.points === 1 ? "point" : "points"}
                        {i.tags.length > 0 ? ` · ${i.tags.join(", ")}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <Button size="sm" onClick={doImport} loading={busy} disabled={disabled || selected.size === 0}>
              Import {selected.size > 0 ? `${selected.size} ` : ""}selected
            </Button>
          </>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Save a question to the bank</h3>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
              Question
              <select value={saveId} onChange={(e) => setSaveId(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-2 text-sm">
                {questions.map((q, n) => (
                  <option key={q.id} value={q.id}>
                    {n + 1}. {q.prompt.slice(0, 60)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm">
              Tags (comma separated)
              <input value={tags} onChange={(e) => setTags(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm" />
            </label>
            <Button size="sm" variant="secondary" onClick={doSave} loading={busy}>
              Save to bank
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
