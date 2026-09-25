"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { QuestionEditor } from "@/components/course-authoring/question-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QUESTION_TYPES } from "@/features/course-authoring/assessment-rules";
import { deleteBankItem, saveBankItem } from "@/features/question-bank/actions";
import { toEditorQuestion, type BankItem } from "@/features/question-bank/bank";

const typeLabel = (t: string) => QUESTION_TYPES.find((x) => x.value === t)?.label.split(" (")[0] ?? t;

export function BankManager({ items }: { items: BankItem[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [tags, setTags] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  function startEdit(id: string | "new", initialTags: string) {
    setEditingId(id);
    setTags(initialTags);
    setTagError(null);
    setNotice(null);
  }

  async function remove(id: string) {
    setBusy(true);
    const r = await deleteBankItem(id);
    setBusy(false);
    setConfirming(null);
    if (!r.ok) {
      setNotice({ tone: "error", text: r.error });
      return;
    }
    setNotice({ tone: "ok", text: "Question deleted." });
    router.refresh();
  }

  const editor = (id: string | "new", item: BankItem | null) => (
    <div className="space-y-3">
      <label className="flex max-w-md flex-col gap-1 text-sm font-medium">
        Tags (comma separated)
        <input value={tags} onChange={(e) => setTags(e.target.value)} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal" />
        {tagError && <span role="alert" className="text-xs text-danger-text">{tagError}</span>}
      </label>
      <QuestionEditor
        initial={item ? toEditorQuestion(item) : null}
        disabled={false}
        onCancel={() => setEditingId(null)}
        onSave={async (input) => {
          const r = await saveBankItem(id === "new" ? null : id, input, tags);
          if (r.ok) {
            setEditingId(null);
            setNotice({ tone: "ok", text: id === "new" ? "Question added to your bank." : "Question saved." });
            router.refresh();
          } else if (r.fieldErrors?.tags) {
            setTagError(r.fieldErrors.tags);
          }
          return r;
        }}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={notice.tone === "error" ? "text-sm text-danger-text" : "text-sm text-success-text"}>
          {notice.text}
        </p>
      )}
      {editingId === "new" ? (
        editor("new", null)
      ) : (
        <Button onClick={() => startEdit("new", "")} disabled={editingId !== null}>
          <Plus className="size-4" aria-hidden="true" />
          Add question
        </Button>
      )}

      <ul aria-label="Bank questions" className="space-y-3">
        {items.map((i) => (
          <li key={i.id} className="rounded-card border border-border bg-surface p-4">
            {editingId === i.id ? (
              editor(i.id, i)
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-medium whitespace-pre-wrap">{i.prompt}</p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    {typeLabel(i.type)} · {i.points} {i.points === 1 ? "point" : "points"}
                    {i.tags.map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" aria-label={`Edit: ${i.prompt.slice(0, 40)}`} disabled={editingId !== null || busy} onClick={() => startEdit(i.id, i.tags.join(", "))} className="rounded-control p-2 text-text-secondary hover:bg-border-subtle disabled:opacity-40">
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  {confirming === i.id ? (
                    <span role="alertdialog" aria-label="Confirm deleting this question" className="inline-flex items-center gap-1">
                      <Button size="sm" variant="destructive" onClick={() => remove(i.id)} loading={busy}>
                        Delete question
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <button type="button" aria-label={`Delete: ${i.prompt.slice(0, 40)}`} disabled={editingId !== null || busy} onClick={() => setConfirming(i.id)} className="rounded-control p-2 text-text-secondary hover:bg-border-subtle disabled:opacity-40">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
