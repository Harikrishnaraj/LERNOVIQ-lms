import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminCourses, type AdminCourse } from "./courses";
import { evaluateReadiness, getReadinessSnapshot, type ReadinessReport, type ReadinessSnapshot } from "@/features/course-authoring/readiness";
import { isCourseStatus, type CourseStatus } from "@/features/courses/course-status";

export interface ReviewNote {
  id: string;
  targetType: "course" | "section" | "lesson";
  targetId: string | null;
  targetTitle: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export interface ReviewHistoryEntry {
  id: string;
  action: string;
  fromStatus: string;
  toStatus: string;
  note: string;
  createdAt: string;
}

export interface CourseForReview {
  courseId: string;
  slug: string;
  versionId: string;
  versionNumber: number;
  status: CourseStatus;
  title: string;
  subtitle: string | null;
  description: string;
  outcomes: string[];
  requirements: string[];
  level: string;
  priceCents: number;
  currency: string;
  categoryName: string | null;
  instructor: { id: string; name: string | null; email: string | null };
  submission: { notes: string; createdAt: string } | null;
  snapshot: ReadinessSnapshot;
  report: ReadinessReport;
  notes: ReviewNote[];
  history: ReviewHistoryEntry[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Everything the review screen shows for a course newest version, read under the reviewer RLS
 * (course.read_all). Null when the id is malformed, unknown, or the caller may not read courses.
 */
export async function getCourseForReview(supabase: SupabaseClient, courseId: string): Promise<CourseForReview | null> {
  if (!UUID.test(courseId)) return null;
  const { data: course } = await supabase
    .from("courses")
    .select("id, slug, categories(slug, name)")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return null;

  const { data: v } = await supabase
    .from("course_versions")
    .select("id, version_number, status, title, subtitle, description, outcomes, requirements, level, price_cents, currency")
    .eq("course_id", courseId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!v) return null;

  const category = course.categories as unknown as { slug: string; name: string } | null;
  const [snapshot, adminRows, submissionRes, notesRes, historyRes] = await Promise.all([
    getReadinessSnapshot(supabase, v.id as string, category?.slug ?? null),
    getAdminCourses(supabase),
    supabase
      .from("course_submissions")
      .select("notes, created_at")
      .eq("version_id", v.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("course_review_notes")
      .select("id, target_type, target_id, target_title, body, author_id, created_at")
      .eq("version_id", v.id)
      .order("created_at"),
    supabase
      .from("course_reviews")
      .select("id, action, from_status, to_status, note, created_at")
      .eq("version_id", v.id)
      .order("created_at", { ascending: false }),
  ]);
  if (!snapshot) return null;
  const row: AdminCourse | undefined = adminRows.find((r) => r.courseId === courseId);

  return {
    courseId,
    slug: course.slug as string,
    versionId: v.id as string,
    versionNumber: v.version_number as number,
    status: isCourseStatus(v.status) ? v.status : "draft",
    title: v.title as string,
    subtitle: (v.subtitle as string | null) ?? null,
    description: (v.description as string) ?? "",
    outcomes: (v.outcomes as string[]) ?? [],
    requirements: (v.requirements as string[]) ?? [],
    level: v.level as string,
    priceCents: v.price_cents as number,
    currency: v.currency as string,
    categoryName: category?.name ?? null,
    instructor: {
      id: row?.instructorId ?? "",
      name: row?.instructorName ?? null,
      email: row?.instructorEmail ?? null,
    },
    submission: submissionRes.data
      ? { notes: submissionRes.data.notes as string, createdAt: submissionRes.data.created_at as string }
      : null,
    snapshot,
    report: evaluateReadiness(snapshot),
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id as string,
      targetType: n.target_type as ReviewNote["targetType"],
      targetId: (n.target_id as string | null) ?? null,
      targetTitle: n.target_title as string,
      body: n.body as string,
      authorId: n.author_id as string,
      createdAt: n.created_at as string,
    })),
    history: (historyRes.data ?? []).map((h) => ({
      id: h.id as string,
      action: h.action as string,
      fromStatus: h.from_status as string,
      toStatus: h.to_status as string,
      note: h.note as string,
      createdAt: h.created_at as string,
    })),
  };
}

/** Notes for one target (a section, a lesson, or the whole course when id is null). */
export function notesFor(notes: ReviewNote[], type: ReviewNote["targetType"], id: string | null): ReviewNote[] {
  return notes.filter((n) => n.targetType === type && n.targetId === id);
}

export const NOTE_MAX = 2000;

export function validateNoteBody(body: string): string | null {
  const text = body.trim();
  if (text === "") return "Write a note first.";
  if (text.length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`;
  return null;
}
