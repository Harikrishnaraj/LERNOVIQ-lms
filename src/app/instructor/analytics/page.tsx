import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  BarChart3,
  ClipboardCheck,
  DollarSign,
  GraduationCap,
  PlusCircle,
  Users,
  Video,
} from "lucide-react";
import { AnalyticsFilters } from "@/components/instructor/analytics-filters";
import { InstructorTrendChart } from "@/components/instructor/instructor-trend-chart";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  formatCurrency,
  formatDuration,
  getInstructorAssessmentAnalytics,
  getInstructorCourses,
  getInstructorCoursesBreakdown,
  getInstructorDailyAnalytics,
  getInstructorLessonAnalytics,
  getInstructorQuestionAnalytics,
  parseAnalyticsRange,
  parseCourseFilter,
  summarizeInstructorAnalytics,
} from "@/features/instructor/analytics";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Analytics" };

const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "lessons", label: "Video & Lessons", icon: Video },
  { id: "assessments", label: "Assessments", icon: ClipboardCheck },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DIFFICULTY_TONE: Record<string, BadgeTone> = {
  easy: "success",
  medium: "warning",
  hard: "danger",
};

export default async function InstructorAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedParams = await searchParams;
  const range = parseAnalyticsRange(resolvedParams.range);
  const selectedCourseId = parseCourseFilter(resolvedParams.course);
  const rawTab = (Array.isArray(resolvedParams.tab) ? resolvedParams.tab[0] : resolvedParams.tab) ?? "overview";
  const activeTab: TabId = TABS.some((t) => t.id === rawTab) ? (rawTab as TabId) : "overview";

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

  // Fetch data based on active tab
  const [points, breakdown, lessonStats, assessmentStats, questionStats] = await Promise.all([
    getInstructorDailyAnalytics(supabase, range, validCourseId),
    getInstructorCoursesBreakdown(supabase, range, validCourseId),
    activeTab === "lessons" ? getInstructorLessonAnalytics(supabase, validCourseId) : Promise.resolve([]),
    activeTab === "assessments" ? getInstructorAssessmentAnalytics(supabase, validCourseId) : Promise.resolve([]),
    activeTab === "assessments" ? getInstructorQuestionAnalytics(supabase, validCourseId) : Promise.resolve([]),
  ]);

  const totals = summarizeInstructorAnalytics(points, breakdown);
  const hasNoCourses = courses.length === 0;
  const hasNoActivity = totals.totalEnrollments === 0 && totals.activeLearners === 0 && totals.totalRevenueCents === 0;

  function buildTabUrl(tab: TabId) {
    const params = new URLSearchParams();
    params.set("tab", tab);
    params.set("range", String(range));
    if (validCourseId) params.set("course", validCourseId);
    return `/instructor/analytics?${params.toString()}`;
  }

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
          {/* Section Navigation Tabs */}
          <nav aria-label="Analytics sections" className="flex border-b border-border">
            <div className="flex gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isCurrent = activeTab === tab.id;
                return (
                  <Link
                    key={tab.id}
                    href={buildTabUrl(tab.id)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                      isCurrent
                        ? "border-primary text-primary"
                        : "border-transparent text-text-secondary hover:border-border hover:text-text",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Overview Tab Content */}
          {activeTab === "overview" && (
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

          {/* Video & Lessons Tab Content */}
          {activeTab === "lessons" && (
            <div className="space-y-6">
              <Card>
                <CardHeader
                  title="Lesson & Video Engagement"
                  description="Watch time, completion rates, and drop-off by lesson"
                />
                <CardContent className="p-0">
                  {lessonStats.length === 0 ? (
                    <div className="p-8 text-center text-sm text-text-secondary">
                      No lesson data found for the selected course filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-border bg-surface-subtle/50 text-xs font-semibold text-text-secondary">
                          <tr>
                            <th scope="col" className="px-6 py-3.5">Lesson</th>
                            <th scope="col" className="px-6 py-3.5">Type</th>
                            <th scope="col" className="px-6 py-3.5">Section</th>
                            <th scope="col" className="px-6 py-3.5">Course</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Starts</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Completions</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Completion Rate</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Drop-off Rate</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Avg Position / Watch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {lessonStats.map((l) => (
                            <tr key={l.lessonId} className="hover:bg-surface-subtle/30 transition-colors">
                              <td className="px-6 py-4 font-medium text-text">
                                {l.lessonTitle}
                              </td>
                              <td className="px-6 py-4 capitalize text-xs text-text-secondary">
                                {l.lessonType}
                              </td>
                              <td className="px-6 py-4 text-xs text-text-secondary">
                                {l.sectionTitle}
                              </td>
                              <td className="px-6 py-4 text-xs text-text-secondary">
                                {l.courseTitle}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {l.starts.toLocaleString("en-US")}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {l.completions.toLocaleString("en-US")}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs font-semibold text-success">
                                {l.starts === 0 ? "—" : `${l.completionRate}%`}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs font-semibold text-danger">
                                {l.starts === 0 ? "—" : `${l.dropOffRate}%`}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {formatDuration(l.avgWatchSeconds)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Assessments Tab Content */}
          {activeTab === "assessments" && (
            <div className="space-y-6">
              {/* Assessments Overview */}
              <Card>
                <CardHeader
                  title="Assessment Performance"
                  description="Pass rates, average scores, and attempt counts across quizzes and exams"
                />
                <CardContent className="p-0">
                  {assessmentStats.length === 0 ? (
                    <div className="p-8 text-center text-sm text-text-secondary">
                      No assessments found for the selected course filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-border bg-surface-subtle/50 text-xs font-semibold text-text-secondary">
                          <tr>
                            <th scope="col" className="px-6 py-3.5">Assessment</th>
                            <th scope="col" className="px-6 py-3.5">Course</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Pass Mark</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Learners</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Total Attempts</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Pass Rate</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Avg Score</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Avg Attempts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {assessmentStats.map((a) => (
                            <tr key={a.assessmentId} className="hover:bg-surface-subtle/30 transition-colors">
                              <td className="px-6 py-4 font-medium text-text">
                                {a.assessmentTitle}
                              </td>
                              <td className="px-6 py-4 text-xs text-text-secondary">
                                {a.courseTitle}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {a.passMark}%
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {a.totalLearners.toLocaleString("en-US")}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {a.totalAttempts.toLocaleString("en-US")}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs font-semibold text-text">
                                {a.totalAttempts === 0 ? "—" : `${a.passRate}%`}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {a.totalAttempts === 0 ? "—" : `${a.avgScore}%`}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {a.totalLearners === 0 ? "—" : a.avgAttempts}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Question Difficulty & Quality */}
              <Card>
                <CardHeader
                  title="Question Difficulty & Quality"
                  description="Difficulty ratings based on student success rates across attempts"
                />
                <CardContent className="p-0">
                  {questionStats.length === 0 ? (
                    <div className="p-8 text-center text-sm text-text-secondary">
                      No questions found for the selected course filter.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-border bg-surface-subtle/50 text-xs font-semibold text-text-secondary">
                          <tr>
                            <th scope="col" className="px-6 py-3.5">Question Prompt</th>
                            <th scope="col" className="px-6 py-3.5">Assessment</th>
                            <th scope="col" className="px-6 py-3.5">Type</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Points</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Attempts</th>
                            <th scope="col" className="px-6 py-3.5 text-right">Success Rate</th>
                            <th scope="col" className="px-6 py-3.5 text-center">Difficulty</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/60">
                          {questionStats.map((q) => (
                            <tr key={q.questionId} className="hover:bg-surface-subtle/30 transition-colors">
                              <td className="px-6 py-4 font-medium text-text max-w-md truncate">
                                {q.prompt}
                              </td>
                              <td className="px-6 py-4 text-xs text-text-secondary">
                                {q.assessmentTitle}
                              </td>
                              <td className="px-6 py-4 text-xs uppercase text-text-secondary">
                                {q.questionType}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {q.points}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {q.totalAttempts.toLocaleString("en-US")}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-xs text-text">
                                {q.passRate}%
                              </td>
                              <td className="px-6 py-4 text-center">
                                <Badge tone={DIFFICULTY_TONE[q.difficulty] ?? "neutral"}>
                                  {q.difficulty}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}
    </>
  );
}
