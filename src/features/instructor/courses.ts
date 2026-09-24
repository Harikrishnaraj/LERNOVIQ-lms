import type { SupabaseClient } from "@supabase/supabase-js";
import { isCourseStatus, type CourseStatus } from "@/features/courses/course-status";

export interface InstructorCourse {
  courseId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  /** Status of the latest version (the one being worked on). */
  status: CourseStatus;
  versionNumber: number;
  versionCount: number;
  level: string;
  priceCents: number;
  currency: string;
  categoryName: string | null;
  updatedAt: string;
  /** A published version is live for learners (even if a newer draft exists). */
  isLive: boolean;
  learners: number;
  completions: number;
  ratingAvg: number;
  ratingCount: number;
}

interface Row {
  course_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  status: string;
  version_number: number;
  version_count: number;
  level: string;
  price_cents: number;
  currency: string;
  category_name: string | null;
  updated_at: string;
  is_live: boolean;
  learners: number;
  completions: number;
  rating_avg: number | string;
  rating_count: number;
}

/** Only the caller own courses (the RPC is hard-wired to auth.uid()). */
export async function getInstructorCourses(supabase: SupabaseClient): Promise<InstructorCourse[]> {
  const { data, error } = await supabase.rpc("instructor_courses");
  if (error) throw new Error(`instructor_courses failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    courseId: r.course_id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    status: isCourseStatus(r.status) ? r.status : "draft",
    versionNumber: r.version_number,
    versionCount: r.version_count,
    level: r.level,
    priceCents: r.price_cents,
    currency: r.currency,
    categoryName: r.category_name,
    updatedAt: r.updated_at,
    isLive: r.is_live,
    learners: r.learners,
    completions: r.completions,
    ratingAvg: Number(r.rating_avg),
    ratingCount: r.rating_count,
  }));
}

// ------------------------------------------------------------------ pure list logic

export const STATUS_FILTERS = [
  { id: "all", label: "All", statuses: null },
  { id: "draft", label: "Drafts", statuses: ["draft"] },
  { id: "review", label: "In review", statuses: ["submitted", "in_review", "approved"] },
  { id: "changes", label: "Needs changes", statuses: ["changes_requested", "rejected"] },
  { id: "published", label: "Published", statuses: ["published"] },
  { id: "archived", label: "Archived", statuses: ["archived"] },
] as const satisfies readonly { id: string; label: string; statuses: readonly CourseStatus[] | null }[];

export type StatusFilterId = (typeof STATUS_FILTERS)[number]["id"];

export function parseStatusFilter(raw: string | null | undefined): StatusFilterId {
  return STATUS_FILTERS.find((f) => f.id === raw)?.id ?? "all";
}

export function matchesStatusFilter(status: CourseStatus, filter: StatusFilterId): boolean {
  const def = STATUS_FILTERS.find((f) => f.id === filter)!;
  return def.statuses === null || (def.statuses as readonly CourseStatus[]).includes(status);
}

export function filterCourses(
  courses: InstructorCourse[],
  opts: { status: StatusFilterId; q?: string | null },
): InstructorCourse[] {
  const q = opts.q?.trim().toLowerCase() ?? "";
  return courses.filter(
    (c) =>
      matchesStatusFilter(c.status, opts.status) &&
      (q === "" || c.title.toLowerCase().includes(q) || (c.subtitle ?? "").toLowerCase().includes(q)),
  );
}

export function countByFilter(courses: InstructorCourse[]): Record<StatusFilterId, number> {
  return Object.fromEntries(
    STATUS_FILTERS.map((f) => [f.id, courses.filter((c) => matchesStatusFilter(c.status, f.id)).length]),
  ) as Record<StatusFilterId, number>;
}

export interface InstructorKpis {
  totalCourses: number;
  liveCourses: number;
  learners: number;
  completions: number;
  /** Rating averaged across courses weighted by how many ratings each has; null when unrated. */
  averageRating: number | null;
  inReview: InstructorCourse[];
  needsAttention: InstructorCourse[];
}

export function summarizeInstructor(courses: InstructorCourse[]): InstructorKpis {
  const ratings = courses.reduce((n, c) => n + c.ratingCount, 0);
  const weighted = courses.reduce((n, c) => n + c.ratingAvg * c.ratingCount, 0);
  return {
    totalCourses: courses.length,
    liveCourses: courses.filter((c) => c.isLive).length,
    learners: courses.reduce((n, c) => n + c.learners, 0),
    completions: courses.reduce((n, c) => n + c.completions, 0),
    averageRating: ratings > 0 ? Math.round((weighted / ratings) * 10) / 10 : null,
    inReview: courses.filter((c) => matchesStatusFilter(c.status, "review")),
    needsAttention: courses.filter((c) => matchesStatusFilter(c.status, "changes")),
  };
}
