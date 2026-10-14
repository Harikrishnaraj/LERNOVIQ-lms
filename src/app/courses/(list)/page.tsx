import type { Metadata } from "next";
import Link from "next/link";
import { AddToCartButton } from "@/components/marketing/add-to-cart-button";
import { eyebrow } from "@/components/marketing/ui";
import {
  DURATION_OPTIONS,
  LANGUAGE_OPTIONS,
  LEVEL_OPTIONS,
  PRICE_OPTIONS,
  RATING_OPTIONS,
  SORT_OPTIONS,
  catalogHref,
  hasActiveFilters,
  parseCatalogFilters,
  type CatalogFilters,
} from "@/features/catalog/filters";
import { listCategories, searchCourses, type CourseCardData } from "@/features/catalog/search-courses";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { formatDuration, formatPrice } from "@/lib/utils/format";

// T-262 (F-961, ADR-042): the catalogue in the design export's style (Courses.dc.html) with live
// courses. Still a plain GET form, so filters are shareable URLs and work without JavaScript.
export const metadata: Metadata = {
  title: "Courses",
  description: "Browse and search courses by topic, level, language, duration, price and rating.",
};

const select = "min-h-11 rounded-input border-[1.5px] border-landing-outline bg-surface px-2.5 text-[15px] text-text";
const groupLabel = "text-[13px] font-extrabold tracking-[0.08em] uppercase";

function ChipGroup({
  name,
  legend,
  value,
  options,
}: {
  name: keyof CatalogFilters;
  legend: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${groupLabel} mb-2`}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {[{ value: "", label: "Any" }, ...options].map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" name={name} value={o.value} defaultChecked={(value ?? "") === o.value} className="peer sr-only" />
            <span className="flex min-h-10 items-center rounded-full border-[1.5px] border-landing-outline bg-surface px-3 text-sm font-semibold whitespace-nowrap peer-checked:border-text peer-checked:bg-text peer-checked:text-white peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CourseResult({ c }: { c: CourseCardData }) {
  const level = LEVEL_OPTIONS.find((l) => l.value === c.level)?.label ?? c.level;
  const language = LANGUAGE_OPTIONS.find((l) => l.value === c.language)?.label ?? c.language;
  return (
    <li className="flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-[border-color,box-shadow] duration-200 hover:border-primary hover:shadow-[0_14px_30px_-20px_rgba(10,31,84,0.4)]">
      {c.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, remote storage host
        <img src={c.thumbnailUrl} alt="" loading="lazy" className="aspect-video w-full bg-primary-light object-cover" />
      ) : (
        <span className="aspect-video w-full bg-primary-light" aria-hidden="true" />
      )}
      <div className="flex flex-1 flex-col gap-2.5 p-[18px]">
        {c.categoryName && <span className="text-xs font-bold text-neutral-text">{c.categoryName}</span>}
        <h3 className="text-[17px] leading-[1.35] font-bold">
          <Link href={`/courses/${c.slug}`} className="hover:text-primary-dark">
            {c.title}
          </Link>
        </h3>
        {c.subtitle && <p className="line-clamp-2 text-sm leading-[1.55] text-neutral-text">{c.subtitle}</p>}
        {c.instructorName && <p className="text-xs text-neutral-text">By {c.instructorName}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-[13px] text-neutral-text">
          <span className="rounded-md bg-border-subtle px-2 py-[3px] font-semibold text-text">{level}</span>
          <span className="whitespace-nowrap">{formatDuration(c.durationMinutes)}</span>
          <span>{language}</span>
          {c.ratingCount > 0 && (
            <span className="whitespace-nowrap">
              <span aria-hidden="true" className="text-warning-text">★</span> {c.ratingAvg.toFixed(1)}
              <span className="sr-only"> out of 5 from {c.ratingCount} ratings</span>
              <span aria-hidden="true"> ({c.ratingCount.toLocaleString("en-US")})</span>
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2.5 border-t border-border-subtle pt-2.5">
          <span className="text-lg font-extrabold">{formatPrice(c.priceCents, c.currency)}</span>
          <AddToCartButton
            course={{
              courseId: c.id,
              slug: c.slug,
              title: c.title,
              category: c.categoryName,
              durationMinutes: c.durationMinutes,
              priceCents: c.priceCents,
              currency: c.currency,
              thumbnailUrl: c.thumbnailUrl,
            }}
          />
        </div>
      </div>
    </li>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const supabase = await createClient();
  const [categories, result] = await Promise.all([listCategories(supabase), searchCourses(supabase, filters)]);
  const sortOptions = filters.q ? SORT_OPTIONS : SORT_OPTIONS.filter((o) => o.value !== "relevance");
  const active = hasActiveFilters(filters);

  return (
    <>
      <section aria-labelledby="hero-h" className="border-b border-border bg-landing-tint">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3.5 px-6 pt-14 pb-10">
          <p className={eyebrow}>Course catalogue</p>
          <h1 id="hero-h" className="text-[clamp(32px,4vw,48px)] leading-[1.08] font-extrabold tracking-[-0.025em]">
            Courses for learners and teams.
          </h1>
          <p className="max-w-[680px] text-[17px] leading-[1.65] text-landing-body text-pretty">
            Buy a course for yourself, or buy seats for your team. Courses open in LERNOVIQ LMS.
          </p>
        </div>
      </section>

      <form method="get" action="/courses" role="search" aria-label="Search and filter courses" className="mx-auto flex max-w-[1280px] flex-wrap items-start gap-8 px-6 pt-6 pb-24">
        <div className="flex flex-[1_1_100%] flex-wrap items-center gap-3">
          <label htmlFor="q" className="sr-only">
            Search courses
          </label>
          <div className="relative flex-[1_1_320px]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="absolute top-3.5 left-3.5 text-neutral-text">
              <path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4" />
            </svg>
            <input
              id="q"
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              maxLength={100}
              placeholder="Search courses, e.g. risk, banking, design"
              className="min-h-12 w-full rounded-input border-[1.5px] border-landing-outline bg-surface pr-3.5 pl-11 text-base"
            />
          </div>
          <label htmlFor="sort" className="flex items-center gap-2 text-sm font-bold">
            Sort
            <select id="sort" name="sort" defaultValue={filters.sort} className={cn(select, "min-h-12")}>
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="min-h-12 cursor-pointer rounded-input bg-primary px-5 text-[15px] font-bold text-white hover:bg-primary-dark">
            Apply
          </button>
        </div>

        <aside aria-label="Filters" className="flex min-w-60 flex-[0_1_264px] flex-col gap-6 rounded-card border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-extrabold">Filters</h2>
            {active && (
              <Link href="/courses" className="py-1.5 text-sm font-bold text-primary-dark">
                Clear all
              </Link>
            )}
          </div>
          {(
            [
              ["category", "Category", "All categories", categories.map((c) => ({ value: c.slug, label: c.name }))],
              ["language", "Language", "Any language", LANGUAGE_OPTIONS],
              ["duration", "Duration", "Any duration", DURATION_OPTIONS],
            ] as const
          ).map(([key, label, any, options]) => (
            <div key={key} className="flex flex-col gap-2">
              <label htmlFor={`f-${key}`} className={groupLabel}>
                {label}
              </label>
              <select id={`f-${key}`} name={key} defaultValue={filters[key] ?? ""} className={select}>
                <option value="">{any}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <ChipGroup name="level" legend="Level" value={filters.level} options={LEVEL_OPTIONS} />
          <ChipGroup name="price" legend="Price" value={filters.price} options={PRICE_OPTIONS} />
          <ChipGroup name="rating" legend="Rating" value={filters.rating} options={RATING_OPTIONS} />
        </aside>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-[18px]">
          <p role="status" className="text-[15px] font-semibold text-landing-body">
            {result.total === 0
              ? "No courses found"
              : `${result.total.toLocaleString("en-US")} ${result.total === 1 ? "course" : "courses"} found`}
          </p>

          {result.courses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-landing-outline px-6 py-12 text-center">
              <h3 className="text-xl font-extrabold">{active ? "No courses match your search" : "No courses yet"}</h3>
              <p className="text-[15px] text-neutral-text">
                {active ? "Try removing a filter or searching for something broader." : "Published courses will appear here."}
              </p>
              {active && (
                <Link href="/courses" className="flex min-h-11 items-center rounded-input border-[1.5px] border-landing-outline bg-surface px-[18px] text-[15px] font-bold">
                  Clear all filters
                </Link>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,270px),1fr))] gap-[18px]">
              {result.courses.map((c) => (
                <CourseResult key={c.id} c={c} />
              ))}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
              {filters.page > 1 ? (
                <Link href={catalogHref(filters, { page: filters.page - 1 })} rel="prev" className="flex min-h-11 items-center rounded-input border-[1.5px] border-landing-outline px-[18px] text-[15px] font-bold">
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm text-neutral-text">
                Page {result.page} of {result.pageCount}
              </span>
              {filters.page < result.pageCount ? (
                <Link href={catalogHref(filters, { page: filters.page + 1 })} rel="next" className="flex min-h-11 items-center rounded-input border-[1.5px] border-landing-outline px-[18px] text-[15px] font-bold">
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-5 rounded-card bg-text p-7">
            <div className="flex max-w-[560px] flex-col gap-1.5">
              <h2 className="text-xl font-extrabold text-white">Buying for a team?</h2>
              <p className="text-[15px] leading-[1.6] text-landing-on-dark">
                Choose “My company” in the cart to buy seats. For custom courses or large rollouts, talk to us.
              </p>
            </div>
            <Link href="/contact" className="flex min-h-12 items-center rounded-input bg-surface px-5 text-[15px] font-bold text-text">
              Discuss Your Learning Needs
            </Link>
          </div>
        </div>
      </form>
    </>
  );
}
