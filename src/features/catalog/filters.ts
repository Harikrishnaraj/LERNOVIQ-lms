// Catalog filter model (F-101). URL search params are the single source of truth so results
// are shareable and work without client JS; anything invalid is dropped, never trusted.

export const PAGE_SIZE = 12;

export const LEVEL_OPTIONS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "all_levels", label: "All levels" },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "hi", label: "Hindi" },
] as const;

// Upper bound is exclusive (matches the SQL: minutes >= min and < max).
export const DURATION_OPTIONS = [
  { value: "short", label: "Under 1 hour", min: null, max: 60 },
  { value: "medium", label: "1 to 3 hours", min: 60, max: 180 },
  { value: "long", label: "3 hours or more", min: 180, max: null },
] as const;

export const PRICE_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "paid", label: "Paid" },
] as const;

export const RATING_OPTIONS = [
  { value: "4.5", label: "4.5 & up" },
  { value: "4", label: "4.0 & up" },
  { value: "3", label: "3.0 & up" },
] as const;

export const SORT_OPTIONS = [
  { value: "relevance", label: "Most relevant" },
  { value: "newest", label: "Newest" },
  { value: "top_rated", label: "Top rated" },
  { value: "price_low", label: "Price: low to high" },
  { value: "price_high", label: "Price: high to low" },
] as const;

type Value<T extends readonly { value: string }[]> = T[number]["value"];

export interface CatalogFilters {
  q: string | null;
  category: string | null;
  level: Value<typeof LEVEL_OPTIONS> | null;
  language: Value<typeof LANGUAGE_OPTIONS> | null;
  duration: Value<typeof DURATION_OPTIONS> | null;
  price: Value<typeof PRICE_OPTIONS> | null;
  rating: Value<typeof RATING_OPTIONS> | null;
  sort: Value<typeof SORT_OPTIONS>;
  page: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function one(raw: RawParams, key: string): string | null {
  const v = raw[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() !== "" ? s.trim() : null;
}

function oneOf<T extends readonly { value: string }[]>(
  raw: RawParams,
  key: string,
  options: T,
): Value<T> | null {
  const v = one(raw, key);
  return v && options.some((o) => o.value === v) ? (v as Value<T>) : null;
}

export function parseCatalogFilters(raw: RawParams): CatalogFilters {
  const q = one(raw, "q")?.slice(0, 100) ?? null;
  const category = one(raw, "category");
  const sort = oneOf(raw, "sort", SORT_OPTIONS);
  const pageNumber = Number.parseInt(one(raw, "page") ?? "1", 10);

  return {
    q,
    // slugs only: lowercase letters, digits and dashes
    category: category && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(category) ? category : null,
    level: oneOf(raw, "level", LEVEL_OPTIONS),
    language: oneOf(raw, "language", LANGUAGE_OPTIONS),
    duration: oneOf(raw, "duration", DURATION_OPTIONS),
    price: oneOf(raw, "price", PRICE_OPTIONS),
    rating: oneOf(raw, "rating", RATING_OPTIONS),
    // relevance only makes sense with a query
    sort: sort === "relevance" && !q ? "newest" : (sort ?? (q ? "relevance" : "newest")),
    page: Number.isFinite(pageNumber) && pageNumber > 0 ? Math.min(pageNumber, 1000) : 1,
  };
}

/** Builds /courses?… for links (pagination, clearing a filter). Defaults are omitted. */
export function catalogHref(filters: CatalogFilters, overrides: Partial<CatalogFilters> = {}) {
  const f = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const key of [
    "q",
    "category",
    "level",
    "language",
    "duration",
    "price",
    "rating",
  ] as const) {
    if (f[key]) params.set(key, f[key]!);
  }
  const defaultSort = f.q ? "relevance" : "newest";
  if (f.sort !== defaultSort) params.set("sort", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  const qs = params.toString();
  return qs ? `/courses?${qs}` : "/courses";
}

export function hasActiveFilters(f: CatalogFilters): boolean {
  return Boolean(f.q || f.category || f.level || f.language || f.duration || f.price || f.rating);
}
