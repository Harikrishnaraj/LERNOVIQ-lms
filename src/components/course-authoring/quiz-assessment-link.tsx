"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { createAssessment } from "@/features/course-authoring/assessment-actions";

/** Quiz lessons get their questions in the assessment builder: open the linked one or create it. */
export function QuizAssessmentLink({
  courseId,
  lessonId,
  lessonTitle,
  assessmentId,
  disabled,
}: {
  courseId: string;
  lessonId: string;
  lessonTitle: string;
  assessmentId: string | null;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    try {
      const r = await createAssessment(courseId, { title: lessonTitle, lessonId });
      if (r.ok && r.id) router.push(`/instructor/courses/${courseId}/assessments/${r.id}`);
      else if (!r.ok) setError(r.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Assessment" className="mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <ClipboardList className="size-5 text-primary" aria-hidden="true" />
        <p className="text-sm">
          {assessmentId ? "This quiz lesson has an assessment." : "This quiz lesson has no assessment yet."}
        </p>
      </div>
      {assessmentId ? (
        <Link href={`/instructor/courses/${courseId}/assessments/${assessmentId}`} className={buttonClasses({ size: "sm" })}>
          Edit assessment
        </Link>
      ) : (
        <Button size="sm" onClick={create} loading={pending} disabled={disabled}>
          Create assessment
        </Button>
      )}
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}
