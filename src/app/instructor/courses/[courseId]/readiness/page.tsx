import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { evaluateReadiness, getReadinessSnapshot, readinessFixHref } from "@/features/course-authoring/readiness";
import { nextBuiltStep } from "@/features/course-authoring/steps";
import { isCourseStatus } from "@/features/courses/course-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Readiness" };

export default async function ReadinessPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();
  const snapshot = await getReadinessSnapshot(supabase, course.version.id, course.categorySlug);
  if (!snapshot) notFound();

  const report = evaluateReadiness(snapshot);
  const status = isCourseStatus(course.version.status) ? course.version.status : "draft";
  const next = nextBuiltStep("readiness");

  return (
    <>
      <PageHeader
        title={course.version.title}
        description="Everything a reviewer expects before a course can be submitted."
        actions={<StatusBadge kind="course" status={status} />}
      />
      <CourseSteps courseId={course.courseId} current="readiness" />

      <p
        role="status"
        className={
          report.ready
            ? "mb-6 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"
            : "mb-6 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text"
        }
      >
        {report.ready
          ? "Your course is ready to submit for review."
          : `${report.missing.length} ${report.missing.length === 1 ? "item needs" : "items need"} your attention before you can submit.`}
      </p>

      <ul aria-label="Readiness checklist" className="max-w-2xl divide-y divide-border-subtle rounded-card border border-border bg-surface">
        {report.items.map((item) => (
          <li key={item.id} className="flex items-start gap-3 p-4">
            {item.ok ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {item.label}
                <span className="sr-only">{item.ok ? " - complete" : " - missing"}</span>
              </p>
              {!item.ok && item.detail && <p className="mt-0.5 text-sm text-text-secondary">{item.detail}</p>}
            </div>
            {!item.ok && (
              <Link href={readinessFixHref(course.courseId, item)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                Fix<span className="sr-only"> {item.label}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>

      {next && (
        <div className="mt-8 max-w-2xl border-t border-border pt-6">
          <Link href={next.href(course.courseId)} className={buttonClasses({ variant: report.ready ? "primary" : "secondary" })}>
            Next step: {next.label}
          </Link>
        </div>
      )}
    </>
  );
}
