import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, PlayCircle, Route, Sparkles, Sun } from "lucide-react";
import { CourseCard } from "@/components/courses/course-card";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getDashboardData } from "@/features/dashboard/data";
import { createClient } from "@/lib/supabase/server";
import { formatDuration } from "@/lib/utils/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function LearnerHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const data = await getDashboardData(supabase, { id: user!.id, email: user!.email });
  const cont = data.continueLearning;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${data.name}`}
        description={
          data.inProgressCount > 0
            ? `You have ${data.inProgressCount} ${data.inProgressCount === 1 ? "course" : "courses"} in progress.`
            : "Pick a course and start learning."
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 1. Continue learning */}
        <section aria-labelledby="continue-heading" className="lg:col-span-2">
          <Card>
            <CardHeader title="Continue learning" />
            <CardContent>
              {cont ? (
                <div className="space-y-3">
                  <h3 id="continue-heading" className="text-lg font-semibold">
                    {cont.title}
                  </h3>
                  <Progress value={cont.percent} label={`Progress in ${cont.title}`} />
                  <p className="text-sm text-text-secondary">
                    {cont.completedLessons} of {cont.totalLessons} lessons · {cont.percent}%
                  </p>
                  <Link href={`/learner/courses/${cont.slug}`} className={buttonClasses()}>
                    <PlayCircle className="size-4" aria-hidden="true" />
                    {cont.completedLessons > 0 ? "Resume" : "Start learning"}
                  </Link>
                </div>
              ) : (
                <EmptyState
                  icon={PlayCircle}
                  title="Nothing to continue yet"
                  description="Enroll in a course and it will appear here."
                  action={
                    <Link href="/courses" className={buttonClasses()}>
                      Browse courses
                    </Link>
                  }
                />
              )}
            </CardContent>
          </Card>
        </section>

        {/* 2. Today's learning */}
        <section aria-labelledby="today-heading">
          <Card className="h-full">
            <CardHeader
              title="Today's learning"
              description={`${data.completedToday} ${data.completedToday === 1 ? "lesson" : "lessons"} completed today`}
            />
            <CardContent>
              <h3 id="today-heading" className="sr-only">
                Up next
              </h3>
              {data.nextUp.length === 0 ? (
                <EmptyState
                  icon={Sun}
                  title="You are all caught up"
                  description="Lessons to do next will show up here."
                />
              ) : (
                <ul className="space-y-3">
                  {data.nextUp.map((n) => (
                    <li key={n.lessonId}>
                      <Link
                        href={`/learner/courses/${n.courseSlug}/learn/${n.lessonId}`}
                        className="block rounded-control border border-border p-3 hover:bg-border-subtle"
                      >
                        <span className="block text-sm font-medium">{n.lessonTitle}</span>
                        <span className="block text-xs text-text-secondary">
                          {n.courseTitle}
                          {n.minutes > 0 ? ` · ${formatDuration(n.minutes)}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 3. Active path */}
        <section aria-labelledby="path-heading">
          <Card className="h-full">
            <CardHeader title="Active learning path" />
            <CardContent>
              <h3 id="path-heading" className="sr-only">
                Learning path
              </h3>
              <EmptyState
                icon={Route}
                title="No active path"
                description="Structured learning paths will appear here once you join one."
                action={
                  <Link href="/learner/paths" className={buttonClasses({ variant: "secondary" })}>
                    Explore paths
                  </Link>
                }
              />
            </CardContent>
          </Card>
        </section>

        {/* 4. Upcoming assessments */}
        <section aria-labelledby="assessments-heading" className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader title="Upcoming assessments" />
            <CardContent>
              <h3 id="assessments-heading" className="sr-only">
                Assessments to take
              </h3>
              {data.upcomingAssessments.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title="No assessments waiting"
                  description="Quizzes and exams from your courses will show up here."
                />
              ) : (
                <ul className="space-y-3">
                  {data.upcomingAssessments.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-3 rounded-control border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="truncate text-xs text-text-secondary">{a.courseTitle}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {a.inProgress && <Badge tone="warning">In progress</Badge>}
                        <Link
                          href={`/learner/courses/${a.courseSlug}/assessments/${a.id}`}
                          className={buttonClasses({ size: "sm", variant: "secondary" })}
                        >
                          {a.inProgress ? "Continue" : "Open"}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* 5. Recommendations */}
        <section aria-labelledby="recs-heading" className="lg:col-span-3">
          <h2 id="recs-heading" className="mb-3 text-lg font-semibold">
            Recommended for you
          </h2>
          {data.recommendations.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No recommendations yet"
              description="As more courses are published, suggestions based on your interests appear here."
              action={
                <Link href="/courses" className={buttonClasses({ variant: "secondary" })}>
                  Browse courses
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.recommendations.map((c) => (
                <li key={c.id} className="relative">
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
