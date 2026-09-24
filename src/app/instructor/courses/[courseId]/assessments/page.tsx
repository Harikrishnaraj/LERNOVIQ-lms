import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardList, Lock } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { NewAssessmentForm } from "@/components/course-authoring/new-assessment-form";
import { PageHeader } from "@/components/layout/page-header";
import { listAssessments } from "@/features/course-authoring/assessments";
import { getCurriculum } from "@/features/course-authoring/curriculum";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessments" };

export default async function CourseAssessmentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();

  const [assessments, curriculum] = await Promise.all([
    listAssessments(supabase, course.version.id),
    getCurriculum(supabase, course.version.id),
  ]);
  const attached = new Set(assessments.map((a) => a.lessonId).filter(Boolean));
  const quizLessons = curriculum.flatMap((s) => s.lessons).filter((l) => l.type === "quiz" && !attached.has(l.id));

  return (
    <>
      <Link href={`/instructor/courses/${course.courseId}/curriculum`} className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to curriculum
      </Link>
      <PageHeader title="Assessments" description={`Quizzes and exams for ${course.version.title}.`} />

      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so assessments cannot be changed.
        </p>
      )}

      <div className="mb-8">
        <NewAssessmentForm courseId={course.courseId} quizLessons={quizLessons.map((l) => ({ id: l.id, title: l.title }))} disabled={!course.editable} />
      </div>

      {assessments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assessments yet" description="Create one above, then add questions. Attach it to a quiz lesson so learners meet it in the course." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {assessments.map((a) => (
            <li key={a.id} className="rounded-card border border-border bg-surface p-4">
              <h2 className="font-semibold">
                <Link href={`/instructor/courses/${course.courseId}/assessments/${a.id}`} className="hover:underline">
                  {a.title}
                </Link>
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {a.questionCount} {a.questionCount === 1 ? "question" : "questions"}
                {a.lessonTitle ? ` · quiz lesson “${a.lessonTitle}”` : " · not attached to a lesson"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
