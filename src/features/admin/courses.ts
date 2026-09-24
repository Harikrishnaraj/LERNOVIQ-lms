import type { SupabaseClient } from "@supabase/supabase-js";
import { isCourseStatus, type CourseStatus } from "@/features/courses/course-status";

export interface AdminCourse {
  courseId: string;
  versionId: string;
  slug: string;
  title: string;
  status: CourseStatus;
  versionNumber: number;
  instructorId: string;
  instructorName: string | null;
  instructorEmail: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  priceCents: number;
  currency: string;
  learners: number;
  isLive: boolean;
  submittedAt: string | null;
  updatedAt: string;
}

interface Row {
  course_id: string;
  version_id: string;
  slug: string;
  title: string;
  status: string;
  version_number: number;
  instructor_id: string;
  instructor_name: string | null;
  instructor_email: string | null;
  category_slug: string | null;
  category_name: string | null;
  price_cents: number;
  currency: string;
  learners: number;
  is_live: boolean;
  submitted_at: string | null;
  updated_at: string;
}

/** Every course with its newest version. The RPC refuses callers without course.read_all. */
export async function getAdminCourses(supabase: SupabaseClient): Promise<AdminCourse[]> {
  const { data, error } = await supabase.rpc("admin_courses");
  if (error) throw new Error(`admin_courses failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    courseId: r.course_id,
    versionId: r.version_id,
    slug: r.slug,
    title: r.title,
    status: isCourseStatus(r.status) ? r.status : "draft",
    versionNumber: r.version_number,
    instructorId: r.instructor_id,
    instructorName: r.instructor_name,
    instructorEmail: r.instructor_email,
    categorySlug: r.category_slug,
    categoryName: r.category_name,
    priceCents: r.price_cents,
    currency: r.currency,
    learners: r.learners,
    isLive: r.is_live,
    submittedAt: r.submitted_at,
    updatedAt: r.updated_at,
  }));
}

// ------------------------------------------------------------------ pure list logic

export const ADMIN_TABS = [
  { id: "all", label: "All", statuses: null },
  { id: "pending", label: "Pending review", statuses: ["submitted", "in_review"] },
  { id: "changes", label: "Changes requested", statuses: ["changes_requested", "rejected"] },
  { id: "approved", label: "Approved", statuses: ["approved"] },
  { id: "published", label: "Published", statuses: ["published"] },
  { id: "draft", label: "Drafts", statuses: ["draft"] },
  { id: "archived", label: "Archived", statuses: ["archived"] },
] as const satisfies readonly { id: string; label: string; statuses: readonly CourseStatus[] | null }[];

export type AdminTabId = (typeof ADMIN_TABS)[number]["id"];

export interface AdminCourseQuery {
  tab: AdminTabId;
  q: string;
  category: string;
  view: "table" | "grid";
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseAdminCourseQuery(params: Params): AdminCourseQuery {
  const tab = ADMIN_TABS.find((t) => t.id === one(params.tab))?.id ?? "all";
  return {
    tab,
    q: one(params.q).trim().slice(0, 100),
    category: one(params.category).trim().slice(0, 100),
    view: one(params.view) === "grid" ? "grid" : "table",
  };
}

export function countByTab(courses: AdminCourse[]): Record<AdminTabId, number> {
  const counts = {} as Record<AdminTabId, number>;
  for (const tab of ADMIN_TABS) {
    counts[tab.id] =
      tab.statuses === null ? courses.length : courses.filter((c) => (tab.statuses as readonly string[]).includes(c.status)).length;
  }
  return counts;
}

/** Tab, then category, then a case-insensitive search over title, slug and instructor. */
export function filterAdminCourses(courses: AdminCourse[], query: AdminCourseQuery): AdminCourse[] {
  const tab = ADMIN_TABS.find((t) => t.id === query.tab)!;
  const needle = query.q.toLowerCase();
  return courses.filter((c) => {
    if (tab.statuses !== null && !(tab.statuses as readonly string[]).includes(c.status)) return false;
    if (query.category !== "" && c.categorySlug !== query.category) return false;
    if (needle === "") return true;
    return [c.title, c.slug, c.instructorName ?? "", c.instructorEmail ?? ""].some((f) => f.toLowerCase().includes(needle));
  });
}
