"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { messageStudent } from "@/features/instructor/student-actions";

export function MessageStudentForm({ enrollmentId, max }: { enrollmentId: string; max: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const r = await messageStudent(enrollmentId, text);
    setBusy(false);
    if (r.ok) {
      setText("");
      setNotice({ ok: true, text: r.notice ?? "Message sent." });
    } else {
      setNotice({ ok: false, text: r.error });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Message this student" className="max-w-xl space-y-3">
      {notice && (
        <p role={notice.ok ? "status" : "alert"} className={`flex items-center gap-2 text-sm ${notice.ok ? "text-success" : "text-danger"}`}>
          {notice.ok ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <AlertCircle className="size-4" aria-hidden="true" />}
          {notice.text}
        </p>
      )}
      <label htmlFor="student-message" className="block text-sm font-medium">
        Message
      </label>
      <textarea
        id="student-message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={max}
        rows={3}
        className="w-full rounded-control border border-border bg-surface p-2 text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">{text.length}/{max}</span>
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  );
}
