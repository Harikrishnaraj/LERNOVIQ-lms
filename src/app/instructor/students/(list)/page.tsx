import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchX, Users } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  SEGMENTS,
  SEGMENT_HELP,
  SEGMENT_LABEL,
  filterStudents,
  getMyStudents,
  pageStudents,
  parseStudentQuery,
  segmentCounts,
  type Segment,
  type StudentQuery,
} from "@/features/instructor/students";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Students" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const TONE: Record<Segment, BadgeTone> = { just_enrolled: "info", started: "neutral", on_track: "success", at_risk: "danger", completed: "primary" };

function href(q: StudentQuery, over: Partial<StudentQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.q) params.set("q", m.q);
  if (m.course) params.set("course", m.course);
  if (m.segment) params.set("segment", m.segment);
  if (m.page > 1) params.set("page", String(m.page));
  const qs = params.toString();
  return qs ? `/instructor/students?${qs}` : "/instructor/students";
}

export default async function InstructorStudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseStudentQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const all = await getMyStudents(supabase);
  const courses = [...new Map(all.map((s) => [s.courseId, s.courseTitle])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const scoped = filterStudents(all, query);
  const counts = segmentCounts(scoped);
  const { rows, total, pages } = pageStudents(scoped, query.segment, query.page);
  const filtered = query.q !== "" || query.course !== "";

  return (
    <>
      <PageHeader title="Students" description={`${all.length} ${all.length === 1 ? "enrollment" : "enrollments"} across your courses.`} />

      <form method="get" action="/instructor/students" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        {query.segment && <input type="hidden" name="segment" value={query.segment} />}
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search students" type="search" name="q" defaultValue={query.q} maxLength={100} hint="By name" />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Course
          <select name="course" defaultValue={query.course} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All courses</option>
            {courses.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {filtered && (
          <Link href="/instructor/students" className={buttonClasses({ variant: "secondary" })}>
            Clear
          </Link>
        )}
      </form>

      <nav aria-label="Progress segments" className="mb-4 flex flex-wrap gap-1 border-b border-border">
        <Link
          href={href(query, { segment: "", page: 1 })}
          aria-current={query.segment === "" ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", query.segment === "" ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text")}
        >
          All <span className="text-text-muted">({scoped.length})</span>
        </Link>
        {SEGMENTS.map((s) => (
          <Link
            key={s}
            href={href(query, { segment: s, page: 1 })}
            title={SEGMENT_HELP[s]}
            aria-current={query.segment === s ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", query.segment === s ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text")}
          >
            {SEGMENT_LABEL[s]} <span className="text-text-muted">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {all.length === 0 ? (
        <EmptyState icon={Users} title="No students yet" description="Learners appear here as soon as they enroll in one of your courses." />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No students match"
          description="Try another segment, course or name."
          action={
            <Link href="/instructor/students" className={buttonClasses({ variant: "secondary" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">Student</th>
                  <th scope="col" className="p-3">Course</th>
                  <th scope="col" className="p-3">Progress</th>
                  <th scope="col" className="p-3">Segment</th>
                  <th scope="col" className="p-3">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((s) => (
                  <tr key={s.enrollmentId}>
                    <td className="p-3 font-medium">
                      <Link href={`/instructor/students/${s.enrollmentId}`} className="text-primary underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="p-3">{s.courseTitle}</td>
                    <td className="w-48 p-3">
                      <Progress value={s.percent} label={`${s.name} progress in ${s.courseTitle}`} />
                      <span className="text-xs text-text-secondary">
                        {s.completedLessons}/{s.totalLessons} lessons · {s.percent}%
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge tone={TONE[s.segment]} dot>
                        {SEGMENT_LABEL[s.segment]}
                      </Badge>
                    </td>
                    <td className="p-3">{s.lastActivityAt ? dateFormat.format(new Date(s.lastActivityAt)) : `Enrolled ${dateFormat.format(new Date(s.enrolledAt))}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {query.page > 1 ? (
                <Link href={href(query, { page: query.page - 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {Math.min(query.page, pages)} of {pages} · {total} students
              </span>
              {query.page < pages ? (
                <Link href={href(query, { page: query.page + 1 })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
