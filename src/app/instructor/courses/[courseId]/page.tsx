import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { COURSE_STEPS } from "@/features/course-authoring/steps";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { evaluateReadiness, getReadinessSnapshot } from "@/features/course-authoring/readiness";
import { getInstructorCourses } from "@/features/instructor/courses";
import { isCourseStatus } from "@/features/courses/course-status";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Course overview" };

const STEP_HINT: Record<string, string> = {
  basics: "Title, description, category, thumbnail",
  curriculum: "Sections and lessons",
  pricing: "Price, certificate, visibility, prerequisites",
  preview: "See it as a learner",
  readiness: "What is still missing",
  submit: "Send it to a reviewer",
};

export default async function CourseOverviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();

  const [summaries, snapshot] = await Promise.all([
    getInstructorCourses(supabase),
    getReadinessSnapshot(supabase, course.version.id, course.categorySlug),
  ]);
  const summary = summaries.find((c) => c.courseId === course.courseId);
  if (!summary || !snapshot) notFound();

  const status = isCourseStatus(course.version.status) ? course.version.status : "draft";
  const lessonCount = snapshot.sections.reduce((n, s) => n + s.lessons.length, 0);
  const report = course.editable ? evaluateReadiness(snapshot) : null;
  const stats: { label: string; value: string }[] = [
    { label: "Learners", value: String(summary.learners) },
    { label: "Completions", value: String(summary.completions) },
    { label: "Rating", value: summary.ratingCount > 0 ? `${summary.ratingAvg.toFixed(1)} (${summary.ratingCount})` : "No ratings yet" },
    { label: "Sections / lessons", value: `${snapshot.sections.length} / ${lessonCount}` },
    { label: "Assessments", value: String(snapshot.assessments.length) },
    { label: "Price", value: summary.priceCents === 0 ? "Free" : formatPrice(summary.priceCents, summary.currency) },
  ];

  return (
    <>
      <PageHeader
        title={course.version.title}
        description={`Version ${course.version.versionNumber}${summary.versionCount > 1 ? ` of ${summary.versionCount}` : ""}`}
        actions={
          <>
            {summary.isLive && (
              <Link href={`/courses/${course.slug}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <ExternalLink className="size-4" aria-hidden="true" />
                View live page
              </Link>
            )}
            <StatusBadge kind="course" status={status} />
          </>
        }
      />

      {report && (
        <p
          role="status"
          className={
            report.ready
              ? "mb-6 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"
              : "mb-6 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text"
          }
        >
          {report.ready
            ? "Ready to submit for review."
            : `${report.missing.length} ${report.missing.length === 1 ? "item" : "items"} to finish before you can submit.`}{" "}
          <Link href={`/instructor/courses/${course.courseId}/${report.ready ? "submit" : "readiness"}`} className="font-semibold underline">
            {report.ready ? "Submit for review" : "See the checklist"}
          </Link>
        </p>
      )}
      {!course.editable && (
        <p role="status" className="mb-6 rounded-card border border-border bg-surface p-3 text-sm text-text-secondary">
          This course is {status.replace("_", " ")}, so it is read-only for now.
        </p>
      )}

      <dl aria-label="Course statistics" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border border-border bg-surface p-4">
            <dt className="text-xs text-text-secondary">{s.label}</dt>
            <dd className="mt-1 text-lg font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="mb-3 text-base font-semibold">
          Build your course
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {COURSE_STEPS.filter((s) => s.built).map((step) => (
            <li key={step.id}>
              <Link
                href={step.href(course.courseId)}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 hover:bg-border-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{step.label}</span>
                  <span className="block text-xs text-text-secondary">{STEP_HINT[step.id]}</span>
                </span>
                <ArrowRight className="size-4 text-text-secondary" aria-hidden="true" />
              </Link>
            </li>
          ))}
          <li>
            <Link
              href={`/instructor/courses/${course.courseId}/assessments`}
              className="flex items-center gap-3 rounded-card border border-border bg-surface p-4 hover:bg-border-subtle"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Assessments</span>
                <span className="block text-xs text-text-secondary">Quizzes and exams</span>
              </span>
              <ArrowRight className="size-4 text-text-secondary" aria-hidden="true" />
            </Link>
          </li>
        </ul>
      </section>
    </>
  );
}
