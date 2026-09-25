import type { SupabaseClient } from "@supabase/supabase-js";

export interface InstructorReview {
  id: string;
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  userId: string;
  learnerName: string;
  rating: number;
  body: string;
  hidden: boolean;
  instructorReply: string | null;
  repliedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstructorReviewSummary {
  totalReviews: number;
  averageRating: number;
  repliedCount: number;
  unrepliedCount: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  percentages: Record<1 | 2 | 3 | 4 | 5, number>;
}

export const REVIEW_RATING_FILTERS = ["all", 5, 4, 3, 2, 1] as const;
export type ReviewRatingFilter = (typeof REVIEW_RATING_FILTERS)[number];

export const REVIEW_STATUS_FILTERS = ["all", "unreplied", "replied"] as const;
export type ReviewStatusFilter = (typeof REVIEW_STATUS_FILTERS)[number];

export const REVIEW_SORT_OPTIONS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "highest", label: "Highest rating" },
  { id: "lowest", label: "Lowest rating" },
] as const;
export type ReviewSortOption = (typeof REVIEW_SORT_OPTIONS)[number]["id"];

export function parseRatingFilter(raw: string | string[] | undefined | null): ReviewRatingFilter {
  const val = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (val === "5") return 5;
  if (val === "4") return 4;
  if (val === "3") return 3;
  if (val === "2") return 2;
  if (val === "1") return 1;
  return "all";
}

export function parseStatusFilter(raw: string | string[] | undefined | null): ReviewStatusFilter {
  const val = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (val === "unreplied" || val === "replied") return val;
  return "all";
}

export function parseSortOption(raw: string | string[] | undefined | null): ReviewSortOption {
  const val = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (val === "oldest" || val === "highest" || val === "lowest") return val;
  return "newest";
}

export function filterAndSortReviews(
  reviews: InstructorReview[],
  opts: {
    rating?: ReviewRatingFilter;
    status?: ReviewStatusFilter;
    sort?: ReviewSortOption;
    search?: string | null;
  } = {},
): InstructorReview[] {
  let result = [...reviews];

  // Rating filter
  if (opts.rating && opts.rating !== "all") {
    result = result.filter((r) => r.rating === opts.rating);
  }

  // Status filter
  if (opts.status === "unreplied") {
    result = result.filter((r) => !r.instructorReply || r.instructorReply.trim() === "");
  } else if (opts.status === "replied") {
    result = result.filter((r) => r.instructorReply && r.instructorReply.trim() !== "");
  }

  // Search filter
  const q = opts.search?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (r) =>
        r.learnerName.toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q) ||
        r.courseTitle.toLowerCase().includes(q) ||
        (r.instructorReply && r.instructorReply.toLowerCase().includes(q)),
    );
  }

  // Sorting
  const sort = opts.sort ?? "newest";
  result.sort((a, b) => {
    switch (sort) {
      case "oldest":
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case "highest":
        return b.rating - a.rating || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "lowest":
        return a.rating - b.rating || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "newest":
      default:
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
  });

  return result;
}

export function calculateReviewSummary(reviews: InstructorReview[]): InstructorReviewSummary {
  const total = reviews.length;
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  let replied = 0;

  for (const r of reviews) {
    if (r.rating >= 1 && r.rating <= 5) {
      dist[r.rating as 1 | 2 | 3 | 4 | 5]++;
      sum += r.rating;
    }
    if (r.instructorReply && r.instructorReply.trim() !== "") {
      replied++;
    }
  }

  const unreplied = total - replied;
  const avg = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;

  const percentages: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: total > 0 ? Math.round((dist[1] / total) * 100) : 0,
    2: total > 0 ? Math.round((dist[2] / total) * 100) : 0,
    3: total > 0 ? Math.round((dist[3] / total) * 100) : 0,
    4: total > 0 ? Math.round((dist[4] / total) * 100) : 0,
    5: total > 0 ? Math.round((dist[5] / total) * 100) : 0,
  };

  return {
    totalReviews: total,
    averageRating: avg,
    repliedCount: replied,
    unrepliedCount: unreplied,
    distribution: dist,
    percentages,
  };
}

interface ReviewRow {
  id: string;
  course_id: string;
  course_title: string;
  course_slug: string;
  user_id: string;
  learner_name: string;
  rating: number;
  body: string;
  hidden: boolean;
  instructor_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getInstructorReviews(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorReview[]> {
  const { data, error } = await supabase.rpc("instructor_reviews", {
    p_course_id: courseId ?? null,
  });

  if (error) {
    throw new Error(`getInstructorReviews failed: ${error.message}`);
  }

  return ((data ?? []) as ReviewRow[]).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    courseSlug: r.course_slug,
    userId: r.user_id,
    learnerName: r.learner_name,
    rating: r.rating,
    body: r.body,
    hidden: r.hidden,
    instructorReply: r.instructor_reply,
    repliedAt: r.replied_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

interface SummaryRow {
  total_reviews: number;
  average_rating: number;
  replied_count: number;
  unreplied_count: number;
  distribution: Record<string, number>;
}

export async function getInstructorReviewSummary(
  supabase: SupabaseClient,
  courseId?: string | null,
): Promise<InstructorReviewSummary> {
  const { data, error } = await supabase.rpc("instructor_review_summary", {
    p_course_id: courseId ?? null,
  });

  if (error) {
    throw new Error(`getInstructorReviewSummary failed: ${error.message}`);
  }

  const raw = data as SummaryRow | null;
  const total = raw?.total_reviews ?? 0;
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: raw?.distribution?.["1"] ?? 0,
    2: raw?.distribution?.["2"] ?? 0,
    3: raw?.distribution?.["3"] ?? 0,
    4: raw?.distribution?.["4"] ?? 0,
    5: raw?.distribution?.["5"] ?? 0,
  };

  const percentages: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: total > 0 ? Math.round((dist[1] / total) * 100) : 0,
    2: total > 0 ? Math.round((dist[2] / total) * 100) : 0,
    3: total > 0 ? Math.round((dist[3] / total) * 100) : 0,
    4: total > 0 ? Math.round((dist[4] / total) * 100) : 0,
    5: total > 0 ? Math.round((dist[5] / total) * 100) : 0,
  };

  return {
    totalReviews: total,
    averageRating: raw?.average_rating ?? 0,
    repliedCount: raw?.replied_count ?? 0,
    unrepliedCount: raw?.unreplied_count ?? 0,
    distribution: dist,
    percentages,
  };
}
