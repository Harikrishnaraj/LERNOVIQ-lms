"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BODY_MAX, TITLE_MAX } from "@/features/discussions/discussions";
import { startDiscussion } from "@/features/discussions/actions";

export function NewThreadForm({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; body?: string }>({});

  if (courses.length === 0) {
    return <p className="mb-6 text-sm text-text-secondary">Enroll in a course to start a discussion.</p>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const r = await startDiscussion(courseId, { title, body });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      setFieldErrors(r.fieldErrors ?? {});
      return;
    }
    router.push(`/learner/discussions/${r.id}`);
  }

  if (!open) {
    return (
      <div className="mb-6">
        <Button onClick={() => setOpen(true)}>Start a discussion</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Start a discussion" className="mb-6 max-w-2xl space-y-4 rounded-card border border-border bg-surface p-4">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Course
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal" />
        {fieldErrors.title && <span role="alert" className="text-xs text-danger-text">{fieldErrors.title}</span>}
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your question or topic
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={BODY_MAX} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
        {fieldErrors.body && <span role="alert" className="text-xs text-danger-text">{fieldErrors.body}</span>}
      </label>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Post discussion
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
