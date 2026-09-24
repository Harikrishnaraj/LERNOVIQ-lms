import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lock } from "lucide-react";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { PricingForm } from "@/components/course-authoring/pricing-form";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getPricingForEditing } from "@/features/course-authoring/pricing";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { nextBuiltStep } from "@/features/course-authoring/steps";
import { isCourseStatus } from "@/features/courses/course-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pricing & settings" };

export default async function PricingPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course || !user) notFound();
  const pricing = await getPricingForEditing(supabase, user.id, course.courseId, course.version.id);
  if (!pricing) notFound();

  const status = isCourseStatus(course.version.status) ? course.version.status : "draft";
  const next = nextBuiltStep("pricing");

  return (
    <>
      <PageHeader
        title={course.version.title}
        description="Pricing, certificate, visibility and prerequisites."
        actions={<StatusBadge kind="course" status={status} />}
      />
      <CourseSteps courseId={course.courseId} current="pricing" />

      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so these settings cannot be changed.
        </p>
      )}

      <PricingForm courseId={course.courseId} initial={pricing} disabled={!course.editable} />

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
