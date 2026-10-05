import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, XCircle } from "lucide-react";
import { CoursePriceForm } from "@/components/admin/course-price-form";
import { DecisionPanel } from "@/components/admin/decision-panel";
import { ReviewNotes } from "@/components/admin/review-notes";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCourseForReview, notesFor } from "@/features/admin/review";
import { allowedCourseActions } from "@/features/courses/course-status";
import { isReviewerAction } from "@/features/courses/transition-rules";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Course review" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function CourseReviewPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "course.read_all"))) {
    return (
      <>
        <PageHeader title="Course review" />
        <PermissionDeniedState title="You cannot view courses" description="Ask an administrator if you need access." />
      </>
    );
  }
  const [course, canReview, canPrice] = await Promise.all([
    getCourseForReview(supabase, courseId),
    can(supabase, user.id, "course.review"),
    can(supabase, user.id, "course.price"),
  ]);
  if (!course) notFound();

  const beingReviewed = course.status === "submitted" || course.status === "in_review";
  const canAddNotes = canReview && beingReviewed;
  const courseNotes = notesFor(course.notes, "course", null);
  const decisions = allowedCourseActions(course.status).filter(isReviewerAction);

  return (
    <>
      <Link href="/admin/courses" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All courses
      </Link>
      <PageHeader
        title={course.title}
        description={`Version ${course.versionNumber} · ${course.instructor.name ?? course.instructor.email ?? "Unknown instructor"}`}
        actions={<StatusBadge kind="course" status={course.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section aria-labelledby="summary-heading" className="space-y-3 rounded-card border border-border bg-surface p-5">
            <h2 id="summary-heading" className="text-base font-semibold">
              Course details
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
              <dt className="text-text-secondary">Category</dt>
              <dd>{course.categoryName ?? "None"}</dd>
              <dt className="text-text-secondary">Level</dt>
              <dd className="capitalize">{course.level.replace("_", " ")}</dd>
              <dt className="text-text-secondary">Price</dt>
              <dd>{formatPrice(course.priceCents, course.currency)}</dd>
              <dt className="text-text-secondary">Instructor</dt>
              <dd className="min-w-0 truncate">{course.instructor.email ?? "Unknown"}</dd>
            </dl>
            {course.subtitle && <p className="text-sm text-text-secondary">{course.subtitle}</p>}
            {course.description && <p className="text-sm whitespace-pre-wrap">{course.description}</p>}
            {course.outcomes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">What learners will achieve</h3>
                <ul className="list-disc pl-5 text-sm">
                  {course.outcomes.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </div>
            )}
            <ReviewNotes
              courseId={course.courseId}
              target={{ type: "course", id: null }}
              label="the course"
              notes={courseNotes}
              currentUserId={user.id}
              canAdd={canAddNotes}
            />
          </section>

          <section aria-labelledby="content-heading" className="space-y-4 rounded-card border border-border bg-surface p-5">
            <h2 id="content-heading" className="text-base font-semibold">
              Curriculum
            </h2>
            {course.snapshot.sections.length === 0 ? (
              <p className="text-sm text-text-secondary">This course has no sections.</p>
            ) : (
              course.snapshot.sections.map((section) => (
                <div key={section.id} role="group" aria-label={`Section ${section.title}`} className="space-y-2 rounded-control border border-border p-3">
                  <h3 className="text-sm font-semibold">{section.title}</h3>
                  <ul className="space-y-2">
                    {section.lessons.map((lesson) => (
                      <li key={lesson.id} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <Link
                            href={`/admin/courses/${course.courseId}/lessons/${lesson.id}`}
                            className="min-w-0 truncate font-medium hover:underline"
                          >
                            {lesson.title}
                          </Link>
                          <span className="shrink-0 text-xs text-text-secondary capitalize">{lesson.type}</span>
                        </div>
                        <ReviewNotes
                          courseId={course.courseId}
                          target={{ type: "lesson", id: lesson.id }}
                          label={`lesson ${lesson.title}`}
                          notes={notesFor(course.notes, "lesson", lesson.id)}
                          currentUserId={user.id}
                          canAdd={canAddNotes}
                        />
                      </li>
                    ))}
                  </ul>
                  <ReviewNotes
                    courseId={course.courseId}
                    target={{ type: "section", id: section.id }}
                    label={`section ${section.title}`}
                    notes={notesFor(course.notes, "section", section.id)}
                    currentUserId={user.id}
                    canAdd={canAddNotes}
                  />
                </div>
              ))
            )}
          </section>
        </div>

        <aside className="space-y-6">
          {canReview && (
            <section aria-labelledby="decision-heading" className="rounded-card border border-border bg-surface p-5">
              <h2 id="decision-heading" className="mb-3 text-base font-semibold">
                Decision
              </h2>
              <DecisionPanel courseId={course.courseId} actions={decisions} failingChecks={course.report.missing.length} />
            </section>
          )}
          {canPrice && (
            <section aria-labelledby="price-heading" className="rounded-card border border-border bg-surface p-5">
              <h2 id="price-heading" className="mb-3 text-base font-semibold">
                Price
              </h2>
              <CoursePriceForm courseId={course.courseId} priceCents={course.priceCents} currency={course.currency} />
            </section>
          )}
          <section aria-labelledby="checklist-heading" className="rounded-card border border-border bg-surface p-5">
            <h2 id="checklist-heading" className="mb-3 text-base font-semibold">
              Review checklist
            </h2>
            <p role="status" className="mb-3 text-sm text-text-secondary">
              {course.report.ready ? "All automatic checks pass." : `${course.report.missing.length} automatic ${course.report.missing.length === 1 ? "check fails" : "checks fail"}.`}
            </p>
            <ul aria-label="Automatic checks" className="space-y-2">
              {course.report.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  {item.ok ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  )}
                  <span>
                    {item.label}
                    <span className="sr-only">{item.ok ? " - passes" : " - fails"}</span>
                    {!item.ok && item.detail && <span className="block text-xs text-text-secondary">{item.detail}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {course.submission && (
            <section aria-labelledby="submission-heading" className="rounded-card border border-border bg-surface p-5">
              <h2 id="submission-heading" className="mb-2 text-base font-semibold">
                Instructor notes
              </h2>
              <p className="text-xs text-text-secondary">Submitted {dateTime.format(new Date(course.submission.createdAt))} UTC</p>
              <p className="mt-2 text-sm whitespace-pre-wrap">{course.submission.notes || "No notes were added."}</p>
            </section>
          )}

          <section aria-labelledby="history-heading" className="rounded-card border border-border bg-surface p-5">
            <h2 id="history-heading" className="mb-2 text-base font-semibold">
              Review history
            </h2>
            {course.history.length === 0 ? (
              <p className="text-sm text-text-secondary">No decisions yet.</p>
            ) : (
              <ol className="space-y-2">
                {course.history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <p className="font-medium capitalize">{h.action.replace("_", " ")}</p>
                    <p className="text-xs text-text-secondary">
                      {h.fromStatus.replace("_", " ")} → {h.toStatus.replace("_", " ")} · {dateTime.format(new Date(h.createdAt))} UTC
                    </p>
                    {h.note && <p className="mt-1 whitespace-pre-wrap">{h.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
