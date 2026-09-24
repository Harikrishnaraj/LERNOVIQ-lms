import type { SupabaseClient } from "@supabase/supabase-js";
import { getMyAssignments } from "@/features/assignments/queries";
import type { CalendarEvent } from "./calendar";

interface AttemptRow {
  id: string;
  assessment_id: string;
  submitted_at: string;
  assessments: {
    title: string;
    course_versions: { title: string; courses: { slug: string } | { slug: string }[] } | { title: string; courses: { slug: string } | { slug: string }[] }[];
  } | { title: string; course_versions: unknown }[];
}

const first = <T>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

/**
 * The learner own events in [from, to) (YYYY-MM-DD, UTC): assignment deadlines and submissions,
 * assessment attempts and certificates. All reads run under the learner RLS.
 */
export async function getCalendarEvents(supabase: SupabaseClient, userId: string, from: string, to: string): Promise<CalendarEvent[]> {
  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T00:00:00.000Z`;
  const inRange = (iso: string | null | undefined) => Boolean(iso) && (iso as string) >= fromIso && (iso as string) < toIso;

  const [assignments, attemptsRes, certsRes] = await Promise.all([
    getMyAssignments(supabase, userId),
    supabase
      .from("assessment_attempts")
      .select("id, assessment_id, submitted_at, assessments!inner(title, course_versions!inner(title, courses!course_versions_course_id_fkey(slug)))")
      .eq("user_id", userId)
      .in("status", ["submitted", "graded"])
      .gte("submitted_at", fromIso)
      .lt("submitted_at", toIso),
    supabase
      .from("certificates")
      .select("id, course_title, issued_at")
      .eq("user_id", userId)
      .gte("issued_at", fromIso)
      .lt("issued_at", toIso),
  ]);

  const events: CalendarEvent[] = [];
  for (const a of assignments) {
    const href = `/learner/assignments/${a.id}`;
    if (a.dueAt && inRange(a.dueAt)) {
      events.push({ id: `due-${a.id}`, at: a.dueAt, kind: "assignment_due", title: a.title, courseTitle: a.courseTitle, href });
    }
    if (a.submission && inRange(a.submission.submittedAt)) {
      events.push({ id: `sub-${a.id}`, at: a.submission.submittedAt, kind: "assignment_submitted", title: a.title, courseTitle: a.courseTitle, href });
    }
  }
  for (const row of (attemptsRes.data ?? []) as unknown as AttemptRow[]) {
    const assessment = first(row.assessments) as { title: string; course_versions: unknown };
    const version = first(assessment.course_versions as { title: string; courses: { slug: string } | { slug: string }[] });
    events.push({
      id: `att-${row.id}`,
      at: row.submitted_at,
      kind: "assessment_taken",
      title: assessment.title,
      courseTitle: version.title,
      href: `/learner/courses/${first(version.courses).slug}/assessments/${row.assessment_id}`,
    });
  }
  for (const c of certsRes.data ?? []) {
    events.push({
      id: `cert-${c.id}`,
      at: c.issued_at as string,
      kind: "certificate",
      title: "Certificate earned",
      courseTitle: c.course_title as string,
      href: "/learner/certificates",
    });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
