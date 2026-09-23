import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { CourseCard } from "@/components/courses/course-card";
import { EmptyState } from "@/components/feedback/states";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
} from "@/features/catalog/filters";
import { listCategories, searchCourses } from "@/features/catalog/search-courses";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse and search courses by topic, level, language, duration, price and rating.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseCatalogFilters(await searchParams);
  const supabase = await createClient();
  const [categories, result] = await Promise.all([
    listCategories(supabase),
    searchCourses(supabase, filters),
  ]);
  const sortOptions = filters.q
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((o) => o.value !== "relevance");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Courses</h1>
        <p className="mt-1 text-text-secondary">Find something new to learn.</p>
      </div>

      {/* Plain GET form: shareable URLs, works without JavaScript. */}
      <form
        method="get"
        action="/courses"
        role="search"
        aria-label="Search and filter courses"
        className="rounded-card border border-border bg-surface p-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-4">
            <Input
              label="Search courses"
              type="search"
              name="q"
              defaultValue={filters.q ?? ""}
              maxLength={100}
              placeholder="e.g. python, design, spanish"
            />
          </div>
          <Select
            label="Category"
            name="category"
            placeholder="All categories"
            defaultValue={filters.category ?? ""}
            options={categories.map((c) => ({ value: c.slug, label: c.name }))}
          />
          <Select
            label="Level"
            name="level"
            placeholder="Any level"
            defaultValue={filters.level ?? ""}
            options={LEVEL_OPTIONS}
          />
          <Select
            label="Language"
            name="language"
            placeholder="Any language"
            defaultValue={filters.language ?? ""}
            options={LANGUAGE_OPTIONS}
          />
          <Select
            label="Duration"
            name="duration"
            placeholder="Any duration"
            defaultValue={filters.duration ?? ""}
            options={DURATION_OPTIONS}
          />
          <Select
            label="Price"
            name="price"
            placeholder="Any price"
            defaultValue={filters.price ?? ""}
            options={PRICE_OPTIONS}
          />
          <Select
            label="Rating"
            name="rating"
            placeholder="Any rating"
            defaultValue={filters.rating ?? ""}
            options={RATING_OPTIONS}
          />
          <Select label="Sort by" name="sort" defaultValue={filters.sort} options={sortOptions} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit">Apply</Button>
          {hasActiveFilters(filters) && (
            <Link href="/courses" className={buttonClasses({ variant: "ghost" })}>
              Clear all
            </Link>
          )}
        </div>
      </form>

      <p role="status" className="text-sm text-text-secondary">
        {result.total === 0
          ? "No courses found"
          : `${result.total.toLocaleString("en-US")} ${result.total === 1 ? "course" : "courses"} found`}
      </p>

      {result.courses.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={hasActiveFilters(filters) ? "No courses match your search" : "No courses yet"}
          description={
            hasActiveFilters(filters)
              ? "Try removing a filter or searching for something broader."
              : "Published courses will appear here."
          }
          action={
            hasActiveFilters(filters) ? (
              <Link href="/courses" className={buttonClasses({ variant: "secondary" })}>
                Clear all filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.courses.map((course) => (
            <li key={course.id} className="relative">
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          {filters.page > 1 ? (
            <Link
              href={catalogHref(filters, { page: filters.page - 1 })}
              rel="prev"
              className={buttonClasses({ variant: "secondary" })}
            >
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-text-secondary">
            Page {result.page} of {result.pageCount}
          </span>
          {filters.page < result.pageCount ? (
            <Link
              href={catalogHref(filters, { page: filters.page + 1 })}
              rel="next"
              className={buttonClasses({ variant: "secondary" })}
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
