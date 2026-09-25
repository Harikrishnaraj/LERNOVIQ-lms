import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft } from "lucide-react";
import { AnswerButton, DeleteButton, ReplyForm, ReportButton, VoteButton } from "@/components/discussions/thread-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getDiscussion } from "@/features/discussions/discussions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Discussion" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function DiscussionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const t = await getDiscussion(supabase, id);
  if (!t) notFound();

  const canMarkAnswer = t.mine || t.canModerate;
  // The answer, when there is one, is shown first.
  const answer = t.posts.find((p) => p.id === t.answeredPostId) ?? null;
  const rest = t.posts.filter((p) => p.id !== t.answeredPostId);

  const post = (p: (typeof t.posts)[number], isAnswer: boolean) => (
    <li key={p.id} className={cn("space-y-2 rounded-card border p-4", isAnswer ? "border-success bg-success-light" : "border-border bg-surface")}>
      {isAnswer && (
        <p className="inline-flex items-center gap-1 text-sm font-semibold text-success-text">
          <CheckCircle2 className="size-4" aria-hidden="true" /> Answer
        </p>
      )}
      <p className="text-sm whitespace-pre-wrap">{p.body}</p>
      <p className="text-xs text-text-secondary">
        {p.authorName}
        {p.isInstructor && <Badge tone="primary" className="ml-2">Instructor</Badge>} · {dateTime.format(new Date(p.createdAt))} UTC
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <VoteButton type="post" id={p.id} discussionId={t.id} votes={p.votes} voted={p.voted} own={p.mine} />
        {canMarkAnswer && <AnswerButton discussionId={t.id} postId={p.id} isAnswer={isAnswer} />}
        {!p.mine && <ReportButton type="post" id={p.id} discussionId={t.id} reported={p.reported} />}
        {p.mine && <DeleteButton type="post" id={p.id} discussionId={t.id} />}
      </div>
    </li>
  );

  return (
    <>
      <Link href="/learner/discussions" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All discussions
      </Link>
      <PageHeader title={t.title} description={t.courseTitle} actions={t.answeredPostId ? <Badge tone="success" dot>Answered</Badge> : undefined} />

      <div className="max-w-2xl space-y-6">
        <article aria-label="Original post" className="space-y-2 rounded-card border border-border bg-surface p-4">
          <p className="text-sm whitespace-pre-wrap">{t.body}</p>
          <p className="text-xs text-text-secondary">
            {t.authorName} · {dateTime.format(new Date(t.createdAt))} UTC
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <VoteButton type="thread" id={t.id} discussionId={t.id} votes={t.votes} voted={t.voted} own={t.mine} />
            {!t.mine && <ReportButton type="thread" id={t.id} discussionId={t.id} reported={t.reported} />}
            {t.mine && <DeleteButton type="thread" id={t.id} discussionId={t.id} redirectTo="/learner/discussions" />}
          </div>
        </article>

        <section aria-labelledby="replies-heading" className="space-y-3">
          <h2 id="replies-heading" className="text-base font-semibold">
            {t.posts.length} {t.posts.length === 1 ? "reply" : "replies"}
          </h2>
          {t.posts.length === 0 ? (
            <p className="text-sm text-text-secondary">No replies yet. Be the first to help.</p>
          ) : (
            <ol aria-label="Replies" className="space-y-3">
              {answer && post(answer, true)}
              {rest.map((p) => post(p, false))}
            </ol>
          )}
        </section>

        <ReplyForm discussionId={t.id} />
      </div>
    </>
  );
}
