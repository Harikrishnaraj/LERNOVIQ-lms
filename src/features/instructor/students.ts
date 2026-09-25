import type { SupabaseClient } from "@supabase/supabase-js";

export const SEGMENTS = ["just_enrolled", "started", "on_track", "at_risk", "completed"] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  just_enrolled: "Just enrolled",
  started: "Started",
  on_track: "On track",
  at_risk: "At risk",
  completed: "Completed",
};

export const SEGMENT_HELP: Record<Segment, string> = {
  just_enrolled: "Enrolled in the last 7 days and nothing completed yet.",
  started: "Some progress, or waiting to begin, but not yet on track.",
  on_track: "Active in the last 14 days and at least half done.",
  at_risk: "No activity for 14 days or more.",
  completed: "Finished the course.",
};

export interface Student {
  enrollmentId: string;
  userId: string;
  name: string;
  courseId: string;
  courseTitle: string;
  status: "active" | "completed";
  enrolledAt: string;
  completedAt: string | null;
  completedLessons: number;
  totalLessons: number;
  lastActivityAt: string | null;
  percent: number;
  segment: Segment;
}

const DAY = 86_400_000;
export const JUST_ENROLLED_DAYS = 7;
export const AT_RISK_DAYS = 14;
export const ON_TRACK_PERCENT = 50;

export function percentOf(done: number, total: number): number {
  return total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));
}

/**
 * The progress segment of one enrollment. First match wins: completed, just enrolled (new and no
 * lesson done), at risk (quiet for 14 days, counted from the last activity or the enrolment),
 * on track (at least half done and not at risk), otherwise started.
 */
export function segmentFor(
  e: { status: string; completedLessons: number; totalLessons: number; enrolledAt: string; lastActivityAt: string | null },
  now: Date = new Date(),
): Segment {
  if (e.status === "completed") return "completed";
  const enrolled = new Date(e.enrolledAt).getTime();
  if (e.completedLessons === 0 && now.getTime() - enrolled < JUST_ENROLLED_DAYS * DAY) return "just_enrolled";
  const lastSeen = Math.max(enrolled, e.lastActivityAt ? new Date(e.lastActivityAt).getTime() : 0);
  if (now.getTime() - lastSeen >= AT_RISK_DAYS * DAY) return "at_risk";
  if (percentOf(e.completedLessons, e.totalLessons) >= ON_TRACK_PERCENT) return "on_track";
  return "started";
}

interface Row {
  enrollment_id: string;
  user_id: string;
  learner_name: string;
  course_id: string;
  course_title: string;
  status: string;
  enrolled_at: string;
  completed_at: string | null;
  completed_lessons: number;
  total_lessons: number;
  last_activity_at: string | null;
}

/** Learners in the caller own courses with their segment (the RPC is bound to the caller). */
export async function getMyStudents(supabase: SupabaseClient, now: Date = new Date()): Promise<Student[]> {
  const { data, error } = await supabase.rpc("instructor_students");
  if (error) throw new Error(`instructor_students failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    enrollmentId: r.enrollment_id,
    userId: r.user_id,
    name: r.learner_name,
    courseId: r.course_id,
    courseTitle: r.course_title,
    status: r.status === "completed" ? "completed" : "active",
    enrolledAt: r.enrolled_at,
    completedAt: r.completed_at,
    completedLessons: r.completed_lessons,
    totalLessons: r.total_lessons,
    lastActivityAt: r.last_activity_at,
    percent: percentOf(r.completed_lessons, r.total_lessons),
    segment: segmentFor(
      { status: r.status, completedLessons: r.completed_lessons, totalLessons: r.total_lessons, enrolledAt: r.enrolled_at, lastActivityAt: r.last_activity_at },
      now,
    ),
  }));
}

export interface StudentQuery {
  q: string;
  course: string;
  segment: Segment | "";
  page: number;
}

export const STUDENTS_PAGE_SIZE = 25;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseStudentQuery(params: Params): StudentQuery {
  const segment = one(params.segment);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    course: one(params.course).trim().slice(0, 40),
    segment: (SEGMENTS as readonly string[]).includes(segment) ? (segment as Segment) : "",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

/** Course and text filters (the segment tabs need counts over this set, so it comes first). */
export function filterStudents(all: Student[], q: Pick<StudentQuery, "q" | "course">): Student[] {
  const needle = q.q.toLowerCase();
  return all.filter((s) => (q.course === "" || s.courseId === q.course) && (needle === "" || s.name.toLowerCase().includes(needle)));
}

export function segmentCounts(students: Student[]): Record<Segment, number> {
  const counts = Object.fromEntries(SEGMENTS.map((s) => [s, 0])) as Record<Segment, number>;
  for (const s of students) counts[s.segment]++;
  return counts;
}

/** A page of students, least active first inside a segment so the ones needing attention lead. */
export function pageStudents(students: Student[], segment: Segment | "", page: number): { rows: Student[]; total: number; pages: number } {
  const matching = students.filter((s) => segment === "" || s.segment === segment);
  const sorted = [...matching].sort((a, b) => {
    const la = a.lastActivityAt ?? a.enrolledAt;
    const lb = b.lastActivityAt ?? b.enrolledAt;
    return la.localeCompare(lb) || a.name.localeCompare(b.name);
  });
  const pages = Math.max(1, Math.ceil(sorted.length / STUDENTS_PAGE_SIZE));
  const p = Math.min(page, pages);
  return { rows: sorted.slice((p - 1) * STUDENTS_PAGE_SIZE, p * STUDENTS_PAGE_SIZE), total: sorted.length, pages };
}
