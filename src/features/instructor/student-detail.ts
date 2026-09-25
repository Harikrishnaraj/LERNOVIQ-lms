import type { SupabaseClient } from "@supabase/supabase-js";

export interface StudentLesson {
  lessonId: string;
  title: string;
  type: string;
  section: string;
  durationMinutes: number;
  completedAt: string | null;
  positionSeconds: number;
  touchedAt: string | null;
  state: "completed" | "in_progress" | "not_started";
}

export interface StudentAttempt {
  id: string;
  assessmentTitle: string;
  attemptNumber: number;
  status: string;
  percent: number | null;
  passed: boolean | null;
  submittedAt: string | null;
}

export interface StudentSubmission {
  id: string;
  assignmentTitle: string;
  status: "submitted" | "graded";
  grade: number | null;
  maxPoints: number;
  isLate: boolean;
  submittedAt: string;
}

export interface StudentDetail {
  enrollmentId: string;
  userId: string;
  name: string;
  courseId: string;
  courseTitle: string;
  versionNumber: number;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  lessons: StudentLesson[];
  attempts: StudentAttempt[];
  submissions: StudentSubmission[];
  completedLessons: number;
  percent: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lessonState(completedAt: string | null, positionSeconds: number, touchedAt: string | null): StudentLesson["state"] {
  if (completedAt) return "completed";
  return touchedAt !== null || positionSeconds > 0 ? "in_progress" : "not_started";
}

/** One student in one of the caller own courses; null for anyone else (the RPC checks ownership). */
export async function getStudentDetail(supabase: SupabaseClient, enrollmentId: string): Promise<StudentDetail | null> {
  if (!UUID.test(enrollmentId)) return null;
  const { data, error } = await supabase.rpc("instructor_student_detail", { p_enrollment_id: enrollmentId });
  if (error) throw new Error(`instructor_student_detail failed: ${error.message}`);
  if (!data) return null;
  const d = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const lessons: StudentLesson[] = (d.lessons as Record<string, any>[]).map((l) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    lessonId: l.lesson_id,
    title: l.title,
    type: l.type,
    section: l.section,
    durationMinutes: l.duration_minutes,
    completedAt: l.completed_at ?? null,
    positionSeconds: l.position_seconds ?? 0,
    touchedAt: l.touched_at ?? null,
    state: lessonState(l.completed_at ?? null, l.position_seconds ?? 0, l.touched_at ?? null),
  }));
  const completedLessons = lessons.filter((l) => l.state === "completed").length;
  return {
    enrollmentId: d.enrollment_id,
    userId: d.user_id,
    name: d.name,
    courseId: d.course_id,
    courseTitle: d.course_title,
    versionNumber: d.version_number,
    status: d.status,
    enrolledAt: d.enrolled_at,
    completedAt: d.completed_at ?? null,
    lessons,
    completedLessons,
    percent: lessons.length === 0 ? 0 : Math.round((completedLessons / lessons.length) * 100),
    attempts: (d.attempts as Record<string, any>[]).map((a) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: a.attempt_id,
      assessmentTitle: a.assessment_title,
      attemptNumber: a.attempt_number,
      status: a.status,
      percent: a.percent === null || a.percent === undefined ? null : Number(a.percent),
      passed: a.passed ?? null,
      submittedAt: a.submitted_at ?? null,
    })),
    submissions: (d.submissions as Record<string, any>[]).map((s) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: s.submission_id,
      assignmentTitle: s.assignment_title,
      status: s.status === "graded" ? "graded" : "submitted",
      grade: s.grade ?? null,
      maxPoints: s.max_points,
      isLate: Boolean(s.is_late),
      submittedAt: s.submitted_at,
    })),
  };
}

export const MESSAGE_MAX = 500;

export function validateStudentMessage(input: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const text = typeof input === "string" ? input.trim() : "";
  if (text === "") return { ok: false, error: "Write a message first." };
  if (text.length > MESSAGE_MAX) return { ok: false, error: `Keep the message under ${MESSAGE_MAX} characters.` };
  return { ok: true, text };
}
