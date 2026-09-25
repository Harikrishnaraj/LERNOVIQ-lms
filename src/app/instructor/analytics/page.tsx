import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BarChart3, DollarSign, GraduationCap, PlusCircle, Users } from "lucide-react";
import { AnalyticsFilters } from "@/components/instructor/analytics-filters";
import { InstructorTrendChart } from "@/components/instructor/instructor-trend-chart";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatCurrency,
  getInstructorCourses,
  getInstructorCoursesBreakdown,
  getInstructorDailyAnalytics,
  parseAnalyticsRange,
  parseCourseFilter,
  summarizeInstructorAnalytics,
} from "@/features/instructor/analytics";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Analytics" };

export default async function InstructorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const range = parseAnalyticsRange(resolvedParams.range);
  const selectedCourseId = parseCourseFilter(resolvedParams.course);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch courses owned by this instructor
  const courses = await getInstructorCourses(supabase);

  // If a specific course filter was passed, verify it belongs to this instructor
  const activeCourse = selectedCourseId ? courses.find((c) => c.id === selectedCourseId) : null;
  const validCourseId = activeCourse ? activeCourse.id : null;

  // Fetch daily points and breakdown scoped to instructor and optional course filter
  const [points, breakdown] = await Promise.all([
    getInstructorDailyAnalytics(supabase, range, validCourseId),
    getInstructorCoursesBreakdown(supabase, range, validCourseId),
  ]);

  const totals = summarizeInstructorAnalytics(points, breakdown);
  const hasNoCourses = courses.length === 0;
  const hasNoActivity = totals.totalEnrollments === 0 && totals.activeLearners === 0 && totals.totalRevenueCents === 0;

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          activeCourse
            ? `Performance for "${activeCourse.title}" over the last ${range} days.`
            : `Overall performance across all your courses over the last ${range} days.`
        }
        actions={
          courses.length > 0 ? (
            <AnalyticsFilters
              courses={courses}
              selectedRange={range}
              selectedCourseId={validCourseId}
            />
          ) : undefined
        }
      />

      {hasNoCourses ? (
        <EmptyState
          icon={BarChart3}
          title="No courses yet"
          description="Create and publish your first course to begin tracking enrollments, completions, and student engagement."
          action={
            <Link href="/instructor/courses/new" className={buttonClasses()}>
              <PlusCircle className="mr-2 size-4" />
              Create Course
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* KPI Cards */}
          <dl aria-label="Key performance indicators" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-text-secondary">Enrollments</dt>
                <div className="rounded-control bg-primary-light/50 p-2 text-primary">
                  <Users className="size-4" aria-hidden="true" />
                </div>
              </div>
              <dd className="mt-2 text-3xl font-bold tracking-tight text-text">
                {totals.totalEnrollments.toLocaleString("en-US")}
              </dd>
              <p className="mt-1 text-xs text-text-secondary">
                In the last {range} days
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-text-secondary">Completion Rate</dt>
                <div className="rounded-control bg-success-light/50 p-2 text-success">
                  <GraduationCap className="size-4" aria-hidden="true" />
                </div>
              </div>
              <dd className="mt-2 text-3xl font-bold tracking-tight text-text">
                {totals.completionRate === null ? "—" : `${totals.completionRate}%`}
              </dd>
              <p className="mt-1 text-xs text-text-secondary">
                {totals.totalCompletions} completed
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-text-secondary">Active Learners</dt>
                <div className="rounded-control bg-accent-purple/10 p-2 text-accent-purple">
                  <Activity className="size-4" aria-hidden="true" />
                </div>
              </div>
              <dd className="mt-2 text-3xl font-bold tracking-tight text-text">
                {totals.activeLearners.toLocaleString("en-US")}
              </dd>
              <p className="mt-1 text-xs text-text-secondary">
                Studied or submitted work
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <dt className="text-sm font-medium text-text-secondary">Revenue</dt>
                <div className="rounded-control bg-primary-light/50 p-2 text-primary">
                  <DollarSign className="size-4" aria-hidden="true" />
                </div>
              </div>
              <dd className="mt-2 text-3xl font-bold tracking-tight text-text">
                {formatCurrency(totals.totalRevenueCents)}
              </dd>
              <p className="mt-1 text-xs text-text-secondary">
                {totals.totalEnrollments > 0
                  ? `Avg ${formatCurrency(totals.avgRevenuePerLearnerCents)} / student`
                  : "From paid enrollments"}
              </p>
            </Card>
          </dl>

          {hasNoActivity ? (
            <EmptyState
              icon={BarChart3}
              title="No activity in this period"
              description="Enrollments, completions, active learners, and revenue will chart here as students engage with your courses."
            />
          ) : (
            <div className="space-y-6">
              {/* Daily Activity Chart */}
              <Card>
                <CardHeader
                  title="Daily Engagement & Enrollments"
                  description={`Trend over the last ${range} days`}
                />
                <CardContent>
                  <InstructorTrendChart points={points} />
                </CardContent>
              </Card>

              {/* Course Breakdown Table */}
              <Card>
                <CardHeader
                  title="Course Breakdown"
                  description="Performance breakdown across courses in this time range"
                />
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border bg-surface-subtle/50 text-xs font-semibold text-text-secondary">
                        <tr>
                          <th scope="col" className="px-6 py-3.5">Course</th>
                          <th scope="col" className="px-6 py-3.5 text-right">Enrollments</th>
                          <th scope="col" className="px-6 py-3.5 text-right">Completions</th>
                          <th scope="col" className="px-6 py-3.5 text-right">Completion Rate</th>
                          <th scope="col" className="px-6 py-3.5 text-right">Active Learners</th>
                          <th scope="col" className="px-6 py-3.5 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {breakdown.map((c) => (
                          <tr key={c.courseId} className="hover:bg-surface-subtle/30 transition-colors">
                            <td className="px-6 py-4 font-medium text-text">
                              <Link
                                href={`/instructor/analytics?course=${c.courseId}&range=${range}`}
                                className="hover:text-primary hover:underline"
                              >
                                {c.title}
                              </Link>
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-text">
                              {c.enrollments.toLocaleString("en-US")}
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-text">
                              {c.completions.toLocaleString("en-US")}
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-text">
                              {c.enrollments === 0 ? "—" : `${c.completionRate}%`}
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-xs text-text">
                              {c.activeLearners.toLocaleString("en-US")}
                            </td>
                            <td className="px-6 py-4 text-right font-mono text-xs font-semibold text-text">
                              {formatCurrency(c.revenueCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}
