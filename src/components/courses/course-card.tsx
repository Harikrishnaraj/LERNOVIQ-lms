import Link from "next/link";
import { BookOpen, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LEVEL_OPTIONS } from "@/features/catalog/filters";
import type { CourseCardData } from "@/features/catalog/search-courses";
import { formatDuration, formatPrice } from "@/lib/utils/format";

export function CourseCard({ course }: { course: CourseCardData }) {
  const level = LEVEL_OPTIONS.find((l) => l.value === course.level)?.label ?? course.level;
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow focus-within:shadow-md hover:shadow-md">
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, remote storage host
        <img src={course.thumbnailUrl} alt="" loading="lazy" className="h-28 w-full object-cover" />
      ) : (
        <div className="flex h-28 items-center justify-center bg-primary-light text-primary">
          <BookOpen className="size-9" aria-hidden="true" />
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        {course.categoryName && (
          <span className="text-xs font-medium text-text-secondary">{course.categoryName}</span>
        )}
        <h3 className="text-base leading-snug font-semibold">
          <Link
            href={`/courses/${course.slug}`}
            className="rounded-control after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-primary"
          >
            {course.title}
          </Link>
        </h3>
        {course.subtitle && (
          <p className="line-clamp-2 text-sm text-text-secondary">{course.subtitle}</p>
        )}
        {course.instructorName && (
          <p className="text-xs text-text-secondary">By {course.instructorName}</p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-text-secondary">
          <Badge tone="neutral">{level}</Badge>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {formatDuration(course.durationMinutes)}
          </span>
          {course.ratingCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-warning text-warning" aria-hidden="true" />
              <span>
                {course.ratingAvg.toFixed(1)}
                <span className="sr-only"> out of 5 from {course.ratingCount} ratings</span>
                <span aria-hidden="true"> ({course.ratingCount.toLocaleString("en-US")})</span>
              </span>
            </span>
          )}
        </div>
        <p className="text-base font-semibold">{formatPrice(course.priceCents, course.currency)}</p>
      </div>
    </Card>
  );
}
