import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, BookOpenCheck, Clock, Flame, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { computeStreaks, deriveSkills, formatHours, getMyProgress, recentActivity } from "@/features/progress/progress";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "My Progress" };

function Kpi({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Clock }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-light text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-sm text-text-secondary">{label}</p>
        {hint && <p className="text-xs text-text-muted">{hint}</p>}
      </div>
    </Card>
  );
}

export default async function LearnerProgressPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const progress = await getMyProgress(supabase);
  if (progress.courses.length === 0) {
    return (
      <>
        <PageHeader title="My Progress" description="Your learning at a glance." />
        <EmptyState
          icon={TrendingUp}
          title="Nothing to track yet"
          description="Enroll in a course and complete lessons to see your hours, streak and skills here."
          action={
            <Link href="/courses" className={buttonClasses()}>
              Browse courses
            </Link>
          }
        />
      </>
    );
  }

  const streaks = computeStreaks(progress.activeDays);
  const skills = deriveSkills(progress.courses);
  const completed = progress.courses.filter((c) => c.status === "completed").length;
  const strip = recentActivity(progress.activeDays, 28);

  return (
    <>
      <PageHeader title="My Progress" description="Hours, streaks and skills from your completed lessons." />

      <section aria-label="Key numbers" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Learning time" value={formatHours(progress.minutes)} hint="From completed lessons" icon={Clock} />
        <Kpi label="Lessons completed" value={String(progress.lessonsCompleted)} icon={BookOpenCheck} />
        <Kpi label="Current streak" value={`${streaks.current} ${streaks.current === 1 ? "day" : "days"}`} hint={`Longest: ${streaks.longest}`} icon={Flame} />
        <Kpi label="Courses completed" value={`${completed} of ${progress.courses.length}`} icon={Award} />
      </section>

      <Card className="mb-6">
        <CardHeader title="Last 28 days" description="A filled square is a day you completed a lesson (UTC)." />
        <CardContent>
          <ol aria-label="Activity, last 28 days" className="grid grid-cols-7 gap-1.5">
            {strip.map((d) => (
              <li
                key={d.day}
                title={`${d.day}: ${d.active ? "active" : "no activity"}`}
                className={cn("aspect-square rounded-sm", d.active ? "bg-success" : "bg-border-subtle")}
              >
                <span className="sr-only">
                  {d.day}: {d.active ? "active" : "no activity"}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="courses-heading">
          <Card>
            <CardHeader title="Completion by course" />
            <CardContent>
              <h3 id="courses-heading" className="sr-only">
                Completion by course
              </h3>
              <ul className="space-y-4">
                {progress.courses.map((c) => (
                  <li key={c.courseId} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/learner/courses/${c.slug}`} className="min-w-0 truncate font-medium hover:underline">
                        {c.title}
                      </Link>
                      <span className="shrink-0 text-text-secondary">
                        {c.completedLessons}/{c.totalLessons} lessons · {c.percent}%
                      </span>
                    </div>
                    <Progress value={c.percent} label={`Progress in ${c.title}`} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="skills-heading">
          <Card className="h-full">
            <CardHeader title="Skills" description="By category, from your completed courses." />
            <CardContent>
              <h3 id="skills-heading" className="sr-only">
                Skills
              </h3>
              {skills.length === 0 ? (
                <p className="text-sm text-text-secondary">Complete a lesson in a categorised course to start building skills.</p>
              ) : (
                <ul className="space-y-3">
                  {skills.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-xs text-text-secondary">
                          {s.completedCourses} {s.completedCourses === 1 ? "course" : "courses"} completed · {formatHours(s.minutes)}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-primary-light px-2.5 py-0.5 text-xs font-medium text-primary-dark">{s.level}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
}
