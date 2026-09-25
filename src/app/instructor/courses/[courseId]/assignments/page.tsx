import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardList, Lock } from "lucide-react";
import { NewAssignmentForm } from "@/components/course-authoring/assignment-editor";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { listAssignments } from "@/features/course-authoring/assignment-authoring";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assignments" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function CourseAssignmentsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();
  const assignments = await listAssignments(supabase, course.version.id);

  return (
    <>
      <Link href={`/instructor/courses/${course.courseId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to course
      </Link>
      <PageHeader title="Assignments" description={`Work learners hand in for ${course.version.title}.`} />

      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so assignments cannot be changed.
        </p>
      )}

      <div className="mb-8">
        <NewAssignmentForm courseId={course.courseId} disabled={!course.editable} />
      </div>

      {assignments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments yet" description="Create one above, then set the instructions, deadline and rubric." />
      ) : (
        <ul aria-label="Assignments" className="grid gap-3 md:grid-cols-2">
          {assignments.map((a) => (
            <li key={a.id} className="rounded-card border border-border bg-surface p-4">
              <h2 className="font-semibold">
                <Link href={`/instructor/courses/${course.courseId}/assignments/${a.id}`} className="hover:underline">
                  {a.title}
                </Link>
              </h2>
              <p className="text-sm text-text-secondary">
                {a.maxPoints} points · {a.dueAt ? `due ${dateTime.format(new Date(a.dueAt))} UTC` : "no deadline"}
              </p>
              <p className="text-sm text-text-secondary">
                {a.submissions} {a.submissions === 1 ? "submission" : "submissions"}
                {a.ungraded > 0 ? ` · ${a.ungraded} to grade` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
