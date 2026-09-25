"use client";

import { useId, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Star } from "lucide-react";
import {
  REVIEW_RATING_FILTERS,
  REVIEW_SORT_OPTIONS,
  REVIEW_STATUS_FILTERS,
  type ReviewRatingFilter,
  type ReviewSortOption,
  type ReviewStatusFilter,
} from "@/features/instructor/reviews";
import { cn } from "@/lib/utils/cn";

export interface FilterCourseOption {
  id: string;
  title: string;
}

export function ReviewsFilterBar({
  courses,
  selectedCourseId,
  selectedRating,
  selectedStatus,
  selectedSort,
  searchQuery,
}: {
  courses: FilterCourseOption[];
  selectedCourseId: string | null;
  selectedRating: ReviewRatingFilter;
  selectedStatus: ReviewStatusFilter;
  selectedSort: ReviewSortOption;
  searchQuery: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputId = useId();
  const courseSelectId = useId();
  const sortSelectId = useId();
  const [, startTransition] = useTransition();

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value && value !== "all" && value !== "") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      router.push(`/instructor/reviews?${params.toString()}`);
    });
  };

  const onSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const q = data.get("search")?.toString()?.trim() ?? "";
    updateParam("q", q || null);
  };

  return (
    <div className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-xs">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Course Filter Dropdown */}
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={courseSelectId} className="text-xs font-medium text-text-secondary">
            Course:
          </label>
          <select
            id={courseSelectId}
            aria-label="Filter by course"
            value={selectedCourseId ?? "all"}
            onChange={(e) => updateParam("course", e.target.value === "all" ? null : e.target.value)}
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Courses ({courses.length})</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* Sort Dropdown */}
          <label htmlFor={sortSelectId} className="ml-2 text-xs font-medium text-text-secondary">
            Sort:
          </label>
          <select
            id={sortSelectId}
            aria-label="Sort reviews"
            value={selectedSort}
            onChange={(e) => updateParam("sort", e.target.value)}
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {REVIEW_SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search input form */}
        <form onSubmit={onSearchSubmit} className="relative flex items-center">
          <label htmlFor={searchInputId} className="sr-only">
            Search reviews
          </label>
          <Search className="pointer-events-none absolute left-3 size-4 text-text-muted" aria-hidden="true" />
          <input
            id={searchInputId}
            name="search"
            type="search"
            defaultValue={searchQuery}
            placeholder="Search learner or review..."
            className="w-full rounded-control border border-border bg-surface pl-9 pr-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary md:w-64"
          />
        </form>
      </div>

      {/* Filter Pills: Rating & Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        {/* Rating Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-text-secondary">Rating:</span>
          {REVIEW_RATING_FILTERS.map((r) => {
            const isSelected = selectedRating === r;
            return (
              <button
                key={String(r)}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateParam("rating", r === "all" ? null : String(r))}
                className={cn(
                  "inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-medium transition-colors",
                  isSelected
                    ? "bg-primary text-white"
                    : "bg-surface-subtle text-text-secondary hover:bg-border/60 hover:text-text",
                )}
              >
                {r === "all" ? (
                  "All"
                ) : (
                  <>
                    <span>{r}</span>
                    <Star
                      className={cn("size-3", isSelected ? "fill-white text-white" : "fill-warning text-warning")}
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Reply Status Pills */}
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-text-secondary">Status:</span>
          {REVIEW_STATUS_FILTERS.map((st) => {
            const isSelected = selectedStatus === st;
            return (
              <button
                key={st}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateParam("status", st === "all" ? null : st)}
                className={cn(
                  "rounded-pill px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  isSelected
                    ? "bg-primary text-white"
                    : "bg-surface-subtle text-text-secondary hover:bg-border/60 hover:text-text",
                )}
              >
                {st === "all" ? "All Reviews" : st === "unreplied" ? "Needs Reply" : "Replied"}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
