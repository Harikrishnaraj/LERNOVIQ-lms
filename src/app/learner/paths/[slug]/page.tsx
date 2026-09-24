import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, Circle, PlayCircle } from "lucide-react";
import { PathFollowButton } from "@/components/courses/path-follow-button";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getPath, pathProgress } from "@/features/paths/paths";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatPrice } from "@/lib/utils/format";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const path = await getPath(await createClient(), slug);
  return { title: path?.title ?? "Learning path" };
}

const STATUS_LABEL = { completed: "Completed", active: "In progress", not_started: "Not started" } as const;

export default async function LearningPathPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const path = await getPath(await createClient(), slug);
  if (!path) notFound();
  const progress = pathProgress(path.courses);

  return (
    <>
      <Link href="/learner/paths" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All paths
      </Link>
      <PageHeader title={path.title} description={path.description || undefined} actions={<PathFollowButton slug={path.slug} enrolled={path.enrolled} />} />

      {path.courses.length === 0 ? (
        <EmptyState title="No courses in this path yet" description="Courses will appear here once they are published." />
      ) : (
        <>
          <section aria-label="Path progress" className="mb-6 max-w-2xl space-y-2 rounded-card border border-border bg-surface p-4">
            <Progress value={progress.percent} label={`Progress in ${path.title}`} />
            <p className="text-sm text-text-secondary">
              {progress.completed} of {progress.total} courses completed · {progress.percent}%
            </p>
            {progress.next && (
              <Link href={`/courses/${progress.next.slug}`} className={buttonClasses({ size: "sm" })}>
                {progress.completed === 0 ? "Start with" : "Next up:"} {progress.next.title}
              </Link>
            )}
            {!progress.next && <p role="status" className="text-sm font-medium text-success-text">You have completed every course in this path.</p>}
          </section>

          <ol aria-label="Courses in this path" className="max-w-2xl space-y-3">
            {path.courses.map((c, i) => (
              <li key={c.courseId} className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
                <span className="mt-0.5 shrink-0" aria-hidden="true">
                  {c.status === "completed" ? (
                    <CheckCircle2 className="size-5 text-success" />
                  ) : c.status === "active" ? (
                    <PlayCircle className="size-5 text-primary" />
                  ) : (
                    <Circle className="size-5 text-text-muted" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-text-secondary">Step {i + 1}</p>
                  <h3 className="font-semibold">
                    <Link href={`/courses/${c.slug}`} className="hover:underline">
                      {c.title}
                    </Link>
                  </h3>
                  <p className="text-xs text-text-secondary capitalize">
                    {c.level.replace("_", " ")} · {formatDuration(c.durationMinutes)} · {formatPrice(c.priceCents, c.currency)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-medium text-text-secondary">{STATUS_LABEL[c.status]}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}
