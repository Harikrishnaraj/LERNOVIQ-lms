import type { SupabaseClient } from "@supabase/supabase-js";
import { DURATION_OPTIONS, PAGE_SIZE, type CatalogFilters } from "./filters";

export interface CourseCardData {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  language: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
  thumbnailUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  categoryName: string | null;
  instructorName: string | null;
}

export interface CatalogPage {
  courses: CourseCardData[];
  total: number;
  page: number;
  pageCount: number;
}

interface SearchRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  level: string;
  language: string;
  price_cents: number;
  currency: string;
  duration_minutes: number;
  thumbnail_url: string | null;
  rating_avg: number | string;
  rating_count: number;
  category_name: string | null;
  instructor_name: string | null;
  total_count: number | string;
}

export async function searchCourses(
  supabase: SupabaseClient,
  filters: CatalogFilters,
): Promise<CatalogPage> {
  const duration = DURATION_OPTIONS.find((d) => d.value === filters.duration);
  const { data, error } = await supabase.rpc("search_courses", {
    p_query: filters.q,
    p_category: filters.category,
    p_level: filters.level,
    p_language: filters.language,
    p_min_minutes: duration?.min ?? null,
    p_max_minutes: duration?.max ?? null,
    p_price: filters.price,
    p_min_rating: filters.rating ? Number(filters.rating) : null,
    p_sort: filters.sort,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error(`search_courses failed: ${error.message}`);

  const rows = (data ?? []) as SearchRow[];
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  return {
    courses: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      subtitle: r.subtitle,
      level: r.level,
      language: r.language,
      priceCents: r.price_cents,
      currency: r.currency,
      durationMinutes: r.duration_minutes,
      thumbnailUrl: r.thumbnail_url,
      ratingAvg: Number(r.rating_avg),
      ratingCount: r.rating_count,
      categoryName: r.category_name,
      instructorName: r.instructor_name,
    })),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function listCategories(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("categories")
    .select("slug, name")
    .order("sort_order")
    .order("name");
  if (error) throw new Error(`categories failed: ${error.message}`);
  return (data ?? []) as { slug: string; name: string }[];
}
