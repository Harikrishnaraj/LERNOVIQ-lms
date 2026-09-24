import Link from "next/link";
import { CheckCircle2, ClipboardList, FileText, HelpCircle, Lock, PlayCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isLessonLocked, type PlayerSection } from "@/features/player/navigation";
import { cn } from "@/lib/utils/cn";
import { formatDuration } from "@/lib/utils/format";

const TYPE_ICON: Record<string, LucideIcon> = {
  video: PlayCircle,
  text: FileText,
  quiz: HelpCircle,
  assignment: ClipboardList,
};

export function PlayerSidebar({
  courseSlug,
  sections,
  currentLessonId,
  completed,
  enrolled,
  basePath = `/learner/courses/${courseSlug}/learn`,
}: {
  courseSlug: string;
  sections: PlayerSection[];
  currentLessonId: string;
  completed: ReadonlySet<string>;
  enrolled: boolean;
  /** Lesson links are `${basePath}/${lessonId}`; the instructor preview passes its own. */
  basePath?: string;
}) {
  return (
    <nav aria-label="Course content" className="space-y-4">
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`sec-${section.id}`}>
          <h3
            id={`sec-${section.id}`}
            className="mb-1 px-2 text-xs font-semibold tracking-wide text-text-secondary uppercase"
          >
            {section.title}
          </h3>
          <ul className="space-y-0.5">
            {section.lessons.map((lesson) => {
              const locked = isLessonLocked(lesson, enrolled);
              const done = completed.has(lesson.id);
              const current = lesson.id === currentLessonId;
              const Icon = locked ? Lock : done ? CheckCircle2 : (TYPE_ICON[lesson.type] ?? FileText);
              const body = (
                <>
                  <Icon
                    className={cn("size-4 shrink-0", done && "text-success")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                  <span className="shrink-0 text-xs text-text-secondary">
                    {formatDuration(lesson.durationMinutes)}
                  </span>
                  {done && <span className="sr-only">Completed</span>}
                  {locked && <span className="sr-only">Locked</span>}
                </>
              );
              const cls = cn(
                "flex items-center gap-2 rounded-control px-2 py-2 text-sm",
                current ? "bg-primary-light font-semibold text-primary" : "text-text",
              );
              return (
                <li key={lesson.id}>
                  {locked ? (
                    <span className={cn(cls, "cursor-not-allowed text-text-muted")}>{body}</span>
                  ) : (
                    <Link
                      href={`${basePath}/${lesson.id}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(cls, "hover:bg-border-subtle")}
                    >
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
