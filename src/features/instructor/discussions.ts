import type { SupabaseClient } from "@supabase/supabase-js";

export interface InstructorThread {
  id: string;
  courseId: string;
  courseSlug: string;
  courseTitle: string;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  replies: number;
  votes: number;
  answered: boolean;
  pinned: boolean;
  hidden: boolean;
  openReports: number;
}

export interface InstructorDiscussionReport {
  reportId: string;
  targetType: "thread" | "post";
  targetId: string;
  discussionId: string;
  courseId: string;
  courseTitle: string;
  reason: string;
  targetAuthorName: string;
  targetPreview: string;
  targetHidden: boolean;
  reportedAt: string;
  reporterName: string;
}

export type InstructorDiscussionFilter = "unanswered" | "all" | "answered" | "reported";

export const INSTRUCTOR_FILTERS: { id: InstructorDiscussionFilter; label: string }[] = [
  { id: "unanswered", label: "Unanswered queue" },
  { id: "all", label: "All discussions" },
  { id: "answered", label: "Answered" },
  { id: "reported", label: "Reported / Moderation" },
];

/** Filter threads for the instructor queue. */
export function filterInstructorDiscussions(
  threads: InstructorThread[],
  filter: InstructorDiscussionFilter,
  courseSlug: string,
): InstructorThread[] {
  return threads.filter((t) => {
    if (courseSlug !== "" && t.courseSlug !== courseSlug) return false;
    if (filter === "unanswered") return !t.answered && !t.hidden;
    if (filter === "answered") return t.answered && !t.hidden;
    if (filter === "reported") return t.openReports > 0 || t.hidden;
    return true;
  });
}

/** Discussions in caller-owned courses (RPC enforces c.instructor_id = auth.uid()). */
export async function getInstructorDiscussions(
  supabase: SupabaseClient,
  courseId: string | null = null,
): Promise<InstructorThread[]> {
  const { data, error } = await supabase.rpc("instructor_discussions", { p_course_id: courseId });
  if (error) throw new Error(`instructor_discussions failed: ${error.message}`);
  return ((data ?? []) as {
    id: string;
    course_id: string;
    course_slug: string;
    course_title: string;
    title: string;
    body: string;
    author_name: string;
    created_at: string;
    replies: number;
    votes: number;
    answered: boolean;
    pinned: boolean;
    hidden: boolean;
    open_reports: number;
  }[]).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    courseSlug: r.course_slug,
    courseTitle: r.course_title,
    title: r.title,
    body: r.body,
    authorName: r.author_name,
    createdAt: r.created_at,
    replies: r.replies,
    votes: r.votes,
    answered: r.answered,
    pinned: r.pinned,
    hidden: r.hidden,
    openReports: r.open_reports,
  }));
}

/** Open moderation reports for caller's courses. */
export async function getInstructorDiscussionReports(
  supabase: SupabaseClient,
  courseId: string | null = null,
): Promise<InstructorDiscussionReport[]> {
  const { data, error } = await supabase.rpc("instructor_discussion_reports", { p_course_id: courseId });
  if (error) throw new Error(`instructor_discussion_reports failed: ${error.message}`);
  return ((data ?? []) as {
    report_id: string;
    target_type: "thread" | "post";
    target_id: string;
    discussion_id: string;
    course_id: string;
    course_title: string;
    reason: string;
    target_author_name: string;
    target_preview: string;
    target_hidden: boolean;
    reported_at: string;
    reporter_name: string;
  }[]).map((r) => ({
    reportId: r.report_id,
    targetType: r.target_type,
    targetId: r.target_id,
    discussionId: r.discussion_id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    reason: r.reason,
    targetAuthorName: r.target_author_name,
    targetPreview: r.target_preview,
    targetHidden: r.target_hidden,
    reportedAt: r.reported_at,
    reporterName: r.reporter_name,
  }));
}
