import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Pin,
  ShieldAlert,
} from "lucide-react";
import {
  InstructorModerateButton,
  InstructorPinButton,
  InstructorReplyForm,
  InstructorResolveReportButton,
} from "@/components/discussions/instructor-controls";
import { AnswerButton, DeleteButton, VoteButton } from "@/components/discussions/thread-controls";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getDiscussion } from "@/features/discussions/discussions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Discussion Thread · Instructor" };

const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function InstructorDiscussionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const t = await getDiscussion(supabase, id);
  if (!t) notFound();

  // If the caller cannot moderate this course, they shouldn't view it through the instructor portal
  if (!t.canModerate) {
    redirect("/instructor/discussions");
  }

  // Fetch open reports for this thread and its replies
  const postIds = t.posts.map((p) => p.id);
  const { data: rawReports } = await supabase
    .from("discussion_reports")
    .select("id, target_type, target_id, reason, created_at, reporter:profiles!reporter_id(full_name)")
    .eq("status", "open")
    .or(
      `and(target_type.eq.thread,target_id.eq.${t.id})${
        postIds.length > 0 ? `,and(target_type.eq.post,target_id.in.(${postIds.join(",")}))` : ""
      }`,
    );

  const reports = (rawReports ?? []).map((r) => {
    const rep = r.reporter as unknown as { full_name: string | null } | null;
    return {
      id: r.id as string,
      targetType: r.target_type as "thread" | "post",
      targetId: r.target_id as string,
      reason: r.reason as string,
      createdAt: r.created_at as string,
      reporterName: rep?.full_name?.trim() || "A learner",
    };
  });

  const threadReports = reports.filter((r) => r.targetType === "thread" && r.targetId === t.id);

  const answer = t.posts.find((p) => p.id === t.answeredPostId) ?? null;
  const rest = t.posts.filter((p) => p.id !== t.answeredPostId);

  const renderPost = (p: (typeof t.posts)[number], isAnswer: boolean) => {
    const postReports = reports.filter((r) => r.targetType === "post" && r.targetId === p.id);
    return (
      <li
        key={p.id}
        className={cn(
          "space-y-3 rounded-card border p-4 transition-colors",
          isAnswer
            ? "border-success bg-success-light/20"
            : "border-border bg-surface",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isAnswer && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-text">
                <CheckCircle2 className="size-4" aria-hidden="true" /> Accepted Answer
              </span>
            )}
            {p.isInstructor && (
              <Badge tone="primary">Instructor</Badge>
            )}
            {postReports.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-danger-light px-2 py-0.5 text-xs font-semibold text-danger-text">
                <AlertTriangle className="size-3" aria-hidden="true" /> {postReports.length} report{postReports.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-text">{p.authorName}</span> · {dateTime.format(new Date(p.createdAt))} UTC
          </p>
        </div>

        {/* Post reports notice if any */}
        {postReports.length > 0 && (
          <div className="rounded-control border border-danger/30 bg-danger-light p-2.5 text-xs text-danger-text space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold flex items-center gap-1">
                <ShieldAlert className="size-3.5" aria-hidden="true" /> Reported content:
              </span>
              <InstructorResolveReportButton type="post" id={p.id} discussionId={t.id} />
            </div>
            {postReports.map((pr) => (
              <p key={pr.id}>
                &ldquo;{pr.reason}&rdquo; — Reported by {pr.reporterName}
              </p>
            ))}
          </div>
        )}

        <p className="text-sm whitespace-pre-wrap">{p.body}</p>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
          <div className="flex items-center gap-3">
            <VoteButton type="post" id={p.id} discussionId={t.id} votes={p.votes} voted={p.voted} own={p.mine} />
            <AnswerButton discussionId={t.id} postId={p.id} isAnswer={isAnswer} />
          </div>

          <div className="flex items-center gap-3">
            <InstructorModerateButton
              type="post"
              id={p.id}
              hidden={false}
              discussionId={t.id}
            />
            {p.mine && <DeleteButton type="post" id={p.id} discussionId={t.id} />}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <Link
        href="/instructor/discussions"
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to discussions queue
      </Link>

      <PageHeader
        title={t.title}
        description={t.courseTitle}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {t.answeredPostId && <Badge tone="success" dot>Answered</Badge>}
            <InstructorPinButton discussionId={t.id} pinned={t.pinned} variant="button" />
          </div>
        }
      />

      <div className="max-w-3xl space-y-6">
        {/* Original thread post */}
        <article
          aria-label="Original discussion question"
          className="space-y-4 rounded-card border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-text">{t.authorName}</span>
              <span className="text-text-secondary">· {dateTime.format(new Date(t.createdAt))} UTC</span>
            </div>
            <div className="flex items-center gap-2">
              {t.pinned && (
                <span className="inline-flex items-center gap-1 rounded bg-primary-light px-2 py-0.5 text-xs font-semibold text-primary">
                  <Pin className="size-3" aria-hidden="true" /> Pinned
                </span>
              )}
            </div>
          </div>

          {/* Open reports on this thread */}
          {threadReports.length > 0 && (
            <div className="rounded-control border border-danger/30 bg-danger-light p-3 text-xs text-danger-text space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center gap-1">
                  <ShieldAlert className="size-4" aria-hidden="true" /> This thread has {threadReports.length} open report{threadReports.length === 1 ? "" : "s"}:
                </span>
                <InstructorResolveReportButton type="thread" id={t.id} discussionId={t.id} />
              </div>
              {threadReports.map((tr) => (
                <p key={tr.id}>
                  &ldquo;{tr.reason}&rdquo; — Reported by {tr.reporterName}
                </p>
              ))}
            </div>
          )}

          <p className="text-sm whitespace-pre-wrap">{t.body}</p>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
            <div className="flex items-center gap-3">
              <VoteButton type="thread" id={t.id} discussionId={t.id} votes={t.votes} voted={t.voted} own={t.mine} />
            </div>

            <div className="flex items-center gap-3">
              <InstructorModerateButton
                type="thread"
                id={t.id}
                hidden={false}
                discussionId={t.id}
              />
              {t.mine && (
                <DeleteButton type="thread" id={t.id} discussionId={t.id} redirectTo="/instructor/discussions" />
              )}
            </div>
          </div>
        </article>

        {/* Instructor Reply Form */}
        <section aria-label="Reply as instructor">
          <InstructorReplyForm discussionId={t.id} />
        </section>

        {/* Responses & Answers */}
        <section aria-labelledby="replies-heading" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="replies-heading" className="text-base font-semibold">
              Replies ({t.posts.length})
            </h2>
          </div>

          {t.posts.length === 0 ? (
            <div className="rounded-card border border-dashed border-border p-6 text-center text-sm text-text-secondary">
              No replies yet. Use the instructor reply box above to answer this learner.
            </div>
          ) : (
            <ol aria-label="Replies" className="space-y-4">
              {answer && renderPost(answer, true)}
              {rest.map((p) => renderPost(p, false))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
