import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { BasicsForm } from "@/components/course-authoring/basics-form";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { isCourseStatus } from "@/features/courses/course-status";
import { listCategories } from "@/features/catalog/search-courses";
import { updateBasicsAction } from "@/features/course-authoring/actions";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { nextBuiltStep } from "@/features/course-authoring/steps";
import { buttonClasses } from "@/components/ui/button";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Course basics" };

export default async function CourseBasicsPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ thumbnail?: string }>;
}) {
  const { courseId } = await params;
  const { thumbnail } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();

  const categories = await listCategories(supabase);
  const status = isCourseStatus(course.version.status) ? course.version.status : "draft";
  const next = nextBuiltStep("basics");

  return (
    <>
      <PageHeader
        title={course.version.title}
        description="Step 1 of the guided setup: the basics."
        actions={<StatusBadge kind="course" status={status} />}
      />
      <CourseSteps courseId={course.courseId} current="basics" />

      {!course.editable && (
        <p
          role="status"
          className="mb-6 flex max-w-2xl items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so its details cannot be changed.
        </p>
      )}

      <BasicsForm
        mode="edit"
        categories={categories}
        disabled={!course.editable}
        initialNotice={
          thumbnail === "failed"
            ? "Your course draft was created, but the thumbnail could not be uploaded. Add it again below."
            : null
        }
        initial={{
          title: course.version.title,
          subtitle: course.version.subtitle ?? "",
          categorySlug: course.categorySlug ?? "",
          level: course.version.level,
          language: course.version.language,
          thumbnailUrl: course.version.thumbnailUrl,
        }}
        onSubmit={updateBasicsAction.bind(null, course.courseId)}
      />
      {next && (
        <div className="mt-8 max-w-2xl border-t border-border pt-6">
          <Link href={next.href(course.courseId)} className={buttonClasses({ variant: "secondary" })}>
            Next step: {next.label}
          </Link>
        </div>
      )}
    </>
  );
}
