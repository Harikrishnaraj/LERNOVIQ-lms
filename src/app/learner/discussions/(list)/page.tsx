import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, MessageSquare, Pin, ThumbsUp } from "lucide-react";
import { NewThreadForm } from "@/components/discussions/new-thread-form";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { filterThreads, listDiscussions, type ThreadFilter } from "@/features/discussions/discussions";
import { getMyLearning } from "@/features/my-learning/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Discussions" };

const FILTERS: { id: ThreadFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unanswered", label: "Unanswered" },
  { id: "mine", label: "Mine" },
];

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default async function LearnerDiscussionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const filter = (FILTERS.find((f) => f.id === one(raw.filter))?.id ?? "all") as ThreadFilter;
  const course = one(raw.course).slice(0, 100);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [threads, learning] = await Promise.all([listDiscussions(supabase), getMyLearning(supabase)]);
  const shown = filterThreads(threads, filter, course);
  const courseOptions = [...new Map(threads.map((t) => [t.courseSlug, t.courseTitle])).entries()];
  const href = (over: { filter?: ThreadFilter; course?: string }) => {
    const f = over.filter ?? filter;
    const c = over.course ?? course;
    const params = new URLSearchParams();
    if (f !== "all") params.set("filter", f);
    if (c) params.set("course", c);
    const qs = params.toString();
    return qs ? `/learner/discussions?${qs}` : "/learner/discussions";
  };

  return (
    <>
      <PageHeader title="Discussions" description="Ask questions and help others in your courses." />
      <NewThreadForm courses={learning.map((l) => ({ id: l.courseId, title: l.title }))} />

      <nav aria-label="Filter discussions" className="mb-4 flex flex-wrap items-center gap-1 border-b border-border">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={href({ filter: f.id })}
            aria-current={f.id === filter ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", f.id === filter ? "border-primary text-primary" : "border-transparent text-text-secondary hover:text-text")}
          >
            {f.label}
          </Link>
        ))}
        {courseOptions.length > 1 && (
          <form method="get" action="/learner/discussions" className="ml-auto flex items-center gap-2 pb-1">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <label className="text-sm">
              <span className="sr-only">Course</span>
              <select name="course" defaultValue={course} className="h-9 rounded-input border border-border bg-surface px-2 text-sm">
                <option value="">All courses</option>
                {courseOptions.map(([slug, title]) => (
                  <option key={slug} value={slug}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-control border border-border px-3 py-1.5 text-sm">
              Apply
            </button>
          </form>
        )}
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={threads.length === 0 ? "No discussions yet" : "No discussions match"}
          description={threads.length === 0 ? "Be the first to start a conversation in one of your courses." : "Try another filter."}
        />
      ) : (
        <ul aria-label="Discussions" className="space-y-3">
          {shown.map((t) => (
            <li key={t.id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">
                    {t.pinned && <Pin className="mr-1 inline size-4 text-text-secondary" aria-label="Pinned" />}
                    <Link href={`/learner/discussions/${t.id}`} className="hover:underline">
                      {t.title}
                    </Link>
                  </h2>
                  <p className="line-clamp-2 text-sm text-text-secondary">{t.body}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {t.courseTitle} · {t.authorName} · {dateFormat.format(new Date(t.createdAt))}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-text-secondary">
                  {t.answered && (
                    <span className="inline-flex items-center gap-1 font-medium text-success-text">
                      <CheckCircle2 className="size-4" aria-hidden="true" /> Answered
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <ThumbsUp className="size-4" aria-hidden="true" />
                    {t.votes}
                    <span className="sr-only"> upvotes</span>
                  </span>
                  <span>
                    {t.replies} {t.replies === 1 ? "reply" : "replies"}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
