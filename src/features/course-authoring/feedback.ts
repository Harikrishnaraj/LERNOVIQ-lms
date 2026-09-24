import type { SupabaseClient } from "@supabase/supabase-js";

export interface FeedbackNote {
  id: string;
  targetType: "course" | "section" | "lesson";
  targetId: string | null;
  targetTitle: string;
  body: string;
  createdAt: string;
}

export interface VersionHistory {
  versionId: string;
  versionNumber: number;
  status: string;
  submittedAt: string | null;
  publishedAt: string | null;
  decisions: { id: string; action: string; note: string; createdAt: string }[];
}

export interface ReviewFeedback {
  /** The most recent decision that sent the course back (changes requested or rejected). */
  latestDecision: { action: "request_changes" | "reject"; note: string; createdAt: string } | null;
  /** Reviewer notes on the version being authored that the reviewer has sent back. */
  notes: FeedbackNote[];
  /** Every version, newest first, with its review decisions: the audit trail. */
  versions: VersionHistory[];
}

/**
 * What the instructor sees of the review of their own course. RLS does the hiding: notes appear
 * only once a decision that goes back to the instructor was recorded at or after them, and other
 * instructors get nothing.
 */
export async function getReviewFeedback(
  supabase: SupabaseClient,
  courseId: string,
  currentVersionId: string,
): Promise<ReviewFeedback> {
  const { data: versions } = await supabase
    .from("course_versions")
    .select("id, version_number, status, submitted_at, published_at")
    .eq("course_id", courseId)
    .order("version_number", { ascending: false });
  const ids = (versions ?? []).map((v) => v.id as string);

  const [reviewsRes, notesRes] = await Promise.all([
    ids.length
      ? supabase.from("course_reviews").select("id, version_id, action, note, created_at").in("version_id", ids).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("course_review_notes")
      .select("id, target_type, target_id, target_title, body, created_at")
      .eq("version_id", currentVersionId)
      .order("created_at"),
  ]);
  const reviews = (reviewsRes.data ?? []) as { id: string; version_id: string; action: string; note: string; created_at: string }[];

  const sentBack = reviews.find((r) => r.version_id === currentVersionId && (r.action === "request_changes" || r.action === "reject"));
  return {
    latestDecision: sentBack
      ? { action: sentBack.action as "request_changes" | "reject", note: sentBack.note, createdAt: sentBack.created_at }
      : null,
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id as string,
      targetType: n.target_type as FeedbackNote["targetType"],
      targetId: (n.target_id as string | null) ?? null,
      targetTitle: n.target_title as string,
      body: n.body as string,
      createdAt: n.created_at as string,
    })),
    versions: (versions ?? []).map((v) => ({
      versionId: v.id as string,
      versionNumber: v.version_number as number,
      status: v.status as string,
      submittedAt: (v.submitted_at as string | null) ?? null,
      publishedAt: (v.published_at as string | null) ?? null,
      decisions: reviews
        .filter((r) => r.version_id === v.id)
        .map((r) => ({ id: r.id, action: r.action, note: r.note, createdAt: r.created_at })),
    })),
  };
}

/** Where the instructor goes to act on a note. */
export function feedbackHref(courseId: string, note: Pick<FeedbackNote, "targetType" | "targetId">): string {
  const base = `/instructor/courses/${courseId}`;
  if (note.targetType === "lesson" && note.targetId) return `${base}/lessons/${note.targetId}`;
  if (note.targetType === "section") return `${base}/curriculum`;
  return `${base}/basics`;
}

export const TARGET_LABEL: Record<FeedbackNote["targetType"], string> = {
  course: "Whole course",
  section: "Section",
  lesson: "Lesson",
};
