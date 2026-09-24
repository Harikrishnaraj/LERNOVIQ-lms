import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, BookOpen, CheckCircle2, Clock, GraduationCap, PlusCircle, Star, Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getInstructorCourses, summarizeInstructor } from "@/features/instructor/courses";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof BookOpen;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-10 items-center justify-center rounded-control bg-primary-light text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-text-secondary">{label}</p>
      </div>
    </Card>
  );
}

export default async function InstructorHomePage() {
  const courses = await getInstructorCourses(await createClient());
  const k = summarizeInstructor(courses);

  if (courses.length === 0) {
    return (
      <>
        <PageHeader title="Overview" description="Your teaching at a glance." />
        <EmptyState
          icon={GraduationCap}
          title="Welcome, instructor"
          description="You have not created a course yet. Build your first one, and its stats will show up here."
          action={
            <Link href="/instructor/courses/new" className={buttonClasses()}>
              <PlusCircle className="size-4" aria-hidden="true" />
              Create your first course
            </Link>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description="Your teaching at a glance."
        actions={
          <Link href="/instructor/courses/new" className={buttonClasses()}>
            <PlusCircle className="size-4" aria-hidden="true" />
            Create course
          </Link>
        }
      />

      <section aria-label="Key numbers" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Courses" value={String(k.totalCourses)} icon={BookOpen} />
        <Kpi label="Live courses" value={String(k.liveCourses)} icon={CheckCircle2} />
        <Kpi label="Learners" value={k.learners.toLocaleString("en-US")} icon={Users} />
        <Kpi
          label="Average rating"
          value={k.averageRating === null ? "No ratings" : k.averageRating.toFixed(1)}
          icon={Star}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="attention-heading">
          <Card className="h-full">
            <CardHeader title="Needs your attention" />
            <CardContent>
              <h3 id="attention-heading" className="sr-only">
                Courses needing changes
              </h3>
              {k.needsAttention.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Nothing needs attention"
                  description="Courses with requested changes or a rejection will appear here."
                />
              ) : (
                <ul className="space-y-2">
                  {k.needsAttention.map((c) => (
                    <li key={c.courseId} className="flex items-center justify-between gap-3 rounded-control border border-border p-3">
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <AlertCircle className="size-4 shrink-0 text-warning-text" aria-hidden="true" />
                        <Link href={`/instructor/courses/${c.courseId}`} className="truncate text-sm font-medium hover:underline">
                          {c.title}
                        </Link>
                      </span>
                      <StatusBadge kind="course" status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="review-heading">
          <Card className="h-full">
            <CardHeader title="Waiting for review" />
            <CardContent>
              <h3 id="review-heading" className="sr-only">
                Courses in review
              </h3>
              {k.inReview.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="Nothing in review"
                  description="Submit a finished draft and track its review here."
                />
              ) : (
                <ul className="space-y-2">
                  {k.inReview.map((c) => (
                    <li key={c.courseId} className="flex items-center justify-between gap-3 rounded-control border border-border p-3">
                      <Link href={`/instructor/courses/${c.courseId}`} className="truncate text-sm font-medium hover:underline">
                        {c.title}
                      </Link>
                      <StatusBadge kind="course" status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <p className="mt-6 text-sm text-text-secondary">
        {k.completions.toLocaleString("en-US")} {k.completions === 1 ? "learner has" : "learners have"} completed
        one of your courses.{" "}
        <Link href="/instructor/courses" className="font-medium text-primary hover:underline">
          View all courses
        </Link>
      </p>
    </>
  );
}
