import Link from "next/link";
import { Check } from "lucide-react";
import { COURSE_STEPS, type CourseStepId } from "@/features/course-authoring/steps";
import { cn } from "@/lib/utils/cn";

/** The guided creation flow (ADR-008). Steps whose screen is not built yet are shown but not linked. */
export function CourseSteps({ courseId, current }: { courseId: string | null; current: CourseStepId }) {
  const currentIndex = COURSE_STEPS.findIndex((s) => s.id === current);
  return (
    <nav aria-label="Course setup steps" className="mb-8">
      <ol className="flex flex-wrap gap-x-2 gap-y-2">
        {COURSE_STEPS.map((step, i) => {
          const isCurrent = step.id === current;
          const done = i < currentIndex;
          const href = courseId && step.built ? step.href(courseId) : null;
          const body = (
            <>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                  isCurrent
                    ? "bg-primary text-white"
                    : done
                      ? "bg-success text-white"
                      : "bg-border text-text-secondary",
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden="true" /> : i + 1}
              </span>
              <span>{step.label}</span>
            </>
          );
          const cls = cn(
            "inline-flex items-center gap-2 rounded-control px-2 py-1 text-sm",
            isCurrent ? "font-semibold text-primary" : "text-text-secondary",
          );
          return (
            <li key={step.id}>
              {href && !isCurrent ? (
                <Link href={href} className={cn(cls, "hover:bg-border-subtle")}>
                  {body}
                </Link>
              ) : (
                <span className={cls} aria-current={isCurrent ? "step" : undefined}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
