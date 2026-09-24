"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createAssessment } from "@/features/course-authoring/assessment-actions";

export function NewAssessmentForm({
  courseId,
  quizLessons,
  disabled = false,
}: {
  courseId: string;
  quizLessons: { id: string; title: string }[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const r = await createAssessment(courseId, { title, lessonId: lessonId || null });
      if (r.ok && r.id) router.push(`/instructor/courses/${courseId}/assessments/${r.id}`);
      else if (!r.ok) setError(r.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-wrap items-end gap-3" aria-label="New assessment">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm font-medium">
        Assessment title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={pending || disabled} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal" />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Attach to quiz lesson
        <select value={lessonId} onChange={(e) => setLessonId(e.target.value)} disabled={pending || disabled} className="h-10 rounded-input border border-border bg-surface px-2 text-sm font-normal">
          <option value="">Not attached</option>
          {quizLessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" loading={pending} disabled={disabled}>
        <Plus className="size-4" aria-hidden="true" />
        Create assessment
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}
