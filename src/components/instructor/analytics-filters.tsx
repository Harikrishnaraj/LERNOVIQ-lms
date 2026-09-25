"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ANALYTICS_RANGES, type AnalyticsRange, type InstructorAnalyticsCourse } from "@/features/instructor/analytics";
import { cn } from "@/lib/utils/cn";

export function AnalyticsFilters({
  courses,
  selectedRange,
  selectedCourseId,
}: {
  courses: InstructorAnalyticsCourse[];
  selectedRange: AnalyticsRange;
  selectedCourseId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = (newRange: number, newCourseId: string | null) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("range", String(newRange));
    if (newCourseId) {
      params.set("course", newCourseId);
    } else {
      params.delete("course");
    }
    router.push(`/instructor/analytics?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Course Filter Dropdown */}
      <div className="flex items-center gap-2">
        <label htmlFor="course-filter" className="sr-only">
          Filter by course
        </label>
        <select
          id="course-filter"
          aria-label="Filter by course"
          value={selectedCourseId ?? "all"}
          onChange={(e) => updateFilters(selectedRange, e.target.value === "all" ? null : e.target.value)}
          className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="all">All Courses ({courses.length})</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Date Range Selector */}
      <nav aria-label="Date range" className="inline-flex rounded-control border border-border bg-surface">
        {ANALYTICS_RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-current={r === selectedRange ? "true" : undefined}
            onClick={() => updateFilters(r, selectedCourseId)}
            className={cn(
              "px-3 py-1.5 text-sm transition-colors",
              r === selectedRange
                ? "bg-primary-light font-semibold text-primary"
                : "text-text-secondary hover:text-text",
            )}
          >
            {r}d
          </button>
        ))}
      </nav>
    </div>
  );
}
