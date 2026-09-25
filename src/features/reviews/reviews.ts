import type { SupabaseClient } from "@supabase/supabase-js";

export interface CourseReview {
  id: string;
  rating: number;
  body: string;
  authorName: string;
  createdAt: string;
  mine: boolean;
  instructorReply: string | null;
  repliedAt: string | null;
}

export interface CourseReviews {
  courseId: string;
  average: number;
  count: number;
  /** Number of reviews per star, keys 1-5. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: CourseReview[];
  /** The signed-in learner completed the course and may write or edit a review. */
  canReview: boolean;
  mine: { rating: number; body: string } | null;
}

/** Public reviews of a published course; null when the course is unknown or not published. */
export async function getCourseReviews(supabase: SupabaseClient, slug: string, limit = 20): Promise<CourseReviews | null> {
  const { data, error } = await supabase.rpc("get_course_reviews", { p_slug: slug, p_limit: limit });
  if (error) throw new Error(`get_course_reviews failed: ${error.message}`);
  if (!data) return null;
  const d = data as {
    course_id: string;
    avg: number | string;
    count: number;
    distribution: Record<string, number>;
    reviews: { id: string; rating: number; body: string; author_name: string; created_at: string; mine: boolean; instructor_reply: string | null; replied_at: string | null }[];
    can_review: boolean;
    mine: { rating: number; body: string } | null;
  };
  return {
    courseId: d.course_id,
    average: Number(d.avg),
    count: d.count,
    distribution: { 1: d.distribution["1"] ?? 0, 2: d.distribution["2"] ?? 0, 3: d.distribution["3"] ?? 0, 4: d.distribution["4"] ?? 0, 5: d.distribution["5"] ?? 0 },
    reviews: d.reviews.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      authorName: r.author_name,
      createdAt: r.created_at,
      mine: r.mine,
      instructorReply: r.instructor_reply,
      repliedAt: r.replied_at,
    })),
    canReview: d.can_review,
    mine: d.mine,
  };
}

export const REVIEW_MAX = 2000;

export function validateReview(input: { rating: unknown; body: unknown }): { ok: true; rating: number; body: string } | { ok: false; errors: { rating?: string; body?: string } } {
  const errors: { rating?: string; body?: string } = {};
  const rating = typeof input.rating === "number" ? input.rating : Number.NaN;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "Choose a rating from 1 to 5 stars.";
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body.length > REVIEW_MAX) errors.body = `Keep your review under ${REVIEW_MAX.toLocaleString("en-US")} characters.`;
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, rating, body };
}

/** Share of each star as a whole percentage (0 when there are no reviews). */
export function distributionPercent(d: CourseReviews["distribution"]): Record<1 | 2 | 3 | 4 | 5, number> {
  const total = d[1] + d[2] + d[3] + d[4] + d[5];
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return { 1: pct(d[1]), 2: pct(d[2]), 3: pct(d[3]), 4: pct(d[4]), 5: pct(d[5]) };
}
