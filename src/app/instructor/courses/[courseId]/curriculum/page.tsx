import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { CurriculumBuilder } from "@/components/course-authoring/curriculum-builder";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { getCurriculum } from "@/features/course-authoring/curriculum";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { isCourseStatus } from "@/features/courses/course-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Curriculum" };

export default async function CurriculumPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();

  const sections = await getCurriculum(supabase, course.version.id);
  const status = isCourseStatus(course.version.status) ? course.version.status : "draft";

  return (
    <>
      <PageHeader
        title={course.version.title}
        description="Step 2: organise your course into sections and lessons. Drag to reorder, or use the arrow buttons."
        actions={
          <>
            <Link href={`/instructor/courses/${course.courseId}/assessments`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Assessments
            </Link>
            <StatusBadge kind="course" status={status} />
          </>
        }
      />
      <CourseSteps courseId={course.courseId} current="curriculum" />

      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so the curriculum cannot be changed.
        </p>
      )}

      <CurriculumBuilder courseId={course.courseId} sections={sections} disabled={!course.editable} />
    </>
  );
}
