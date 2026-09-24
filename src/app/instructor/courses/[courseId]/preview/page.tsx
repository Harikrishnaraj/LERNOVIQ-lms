import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/states";
import { firstPreviewLessonId, getCoursePreview } from "@/features/course-authoring/preview";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preview" };

export default async function PreviewIndexPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const preview = user ? await getCoursePreview(supabase, user.id, courseId) : null;
  if (!preview) notFound();

  const first = firstPreviewLessonId(preview.sections);
  if (first) redirect(`/instructor/courses/${preview.courseId}/preview/${first}`);

  return (
    <>
      <PageHeader title={preview.title} description="Preview the course exactly as learners will see it." />
      <CourseSteps courseId={preview.courseId} current="preview" />
      <EmptyState
        title="Nothing to preview yet"
        description="Add at least one lesson in the curriculum, then come back to preview it."
        action={
          <Link href={`/instructor/courses/${preview.courseId}/curriculum`} className={buttonClasses()}>
            Go to curriculum
          </Link>
        }
      />
    </>
  );
}
