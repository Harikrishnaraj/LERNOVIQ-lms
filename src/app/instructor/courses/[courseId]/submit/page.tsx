import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { CourseSteps } from "@/components/course-authoring/course-steps";
import { SubmitForm } from "@/components/course-authoring/submit-form";
import { ReviewFeedbackPanel } from "@/components/course-authoring/review-feedback-panel";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getReviewFeedback } from "@/features/course-authoring/feedback";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { evaluateReadiness, getReadinessSnapshot } from "@/features/course-authoring/readiness";
import { isCourseStatus } from "@/features/courses/course-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Submit for review" };

export default async function SubmitPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();

  const status = isCourseStatus(course.version.status) ? course.version.status : "draft";
  const { data: last } = await supabase
    .from("course_submissions")
    .select("notes, created_at")
    .eq("version_id", course.version.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = course.editable ? await getReadinessSnapshot(supabase, course.version.id, course.categorySlug) : null;
  const report = snapshot ? evaluateReadiness(snapshot) : null;
  const feedback = await getReviewFeedback(supabase, course.courseId, course.version.id);

  return (
    <>
      <PageHeader
        title={course.version.title}
        description="Send your course to a reviewer. You cannot edit it while it is in review."
        actions={<StatusBadge kind="course" status={status} />}
      />
      <CourseSteps courseId={course.courseId} current="submit" />

      <ReviewFeedbackPanel courseId={course.courseId} status={status} feedback={feedback} />

      {!course.editable ? (
        <section aria-label="Submission status" className="max-w-2xl space-y-3 rounded-card border border-border bg-surface p-5">
          <p role="status" className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
            {status === "submitted" ? "Submitted. A reviewer will pick this up soon." : `This course is ${status.replace("_", " ")}.`}
          </p>
          {last && (
            <dl className="space-y-1 text-sm">
              <div>
                <dt className="inline text-text-secondary">Submitted: </dt>
                <dd className="inline">{new Date(last.created_at as string).toLocaleString()}</dd>
              </div>
              {(last.notes as string) !== "" && (
                <div>
                  <dt className="text-text-secondary">Your notes to the reviewer</dt>
                  <dd className="whitespace-pre-wrap">{last.notes as string}</dd>
                </div>
              )}
            </dl>
          )}
        </section>
      ) : report && !report.ready ? (
        <section className="max-w-2xl space-y-3 rounded-card border border-warning bg-warning-light p-5 text-sm text-warning-text">
          <p role="alert">
            Your course is not ready to submit yet: {report.missing.length}{" "}
            {report.missing.length === 1 ? "item needs" : "items need"} attention.
          </p>
          <Link href={`/instructor/courses/${course.courseId}/readiness`} className={buttonClasses({ variant: "secondary" })}>
            Open the readiness checklist
          </Link>
        </section>
      ) : (
        <SubmitForm courseId={course.courseId} resubmit={status === "changes_requested"} />
      )}
    </>
  );
}
