import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { QuizAssessmentLink } from "@/components/course-authoring/quiz-assessment-link";
import { LessonEditor } from "@/components/course-authoring/lesson-editor";
import { PageHeader } from "@/components/layout/page-header";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { getLessonForEditing } from "@/features/course-authoring/lessons";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit lesson" };

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();
  const lesson = await getLessonForEditing(supabase, course.version.id, lessonId);
  if (!lesson) notFound();

  const { data: linked } =
    lesson.type === "quiz"
      ? await supabase.from("assessments").select("id").eq("lesson_id", lesson.id).maybeSingle()
      : { data: null };

  return (
    <>
      <Link
        href={`/instructor/courses/${course.courseId}/curriculum`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to curriculum
      </Link>
      <PageHeader title={lesson.title} description={`In section “${lesson.sectionTitle}” of ${course.version.title}`} />

      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so the lesson cannot be changed.
        </p>
      )}

      {lesson.type === "quiz" && (
        <QuizAssessmentLink
          courseId={course.courseId}
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          assessmentId={(linked?.id as string | undefined) ?? null}
          disabled={!course.editable}
        />
      )}

      <LessonEditor courseId={course.courseId} lesson={lesson} disabled={!course.editable} />
    </>
  );
}
