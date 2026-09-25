"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, ThumbsUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BODY_MAX } from "@/features/discussions/discussions";
import { deleteOwn, markAnswered, postReply, reportContent, toggleVote } from "@/features/discussions/actions";
import { cn } from "@/lib/utils/cn";

type Target = "thread" | "post";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Something went wrong.");
      return;
    }
    after?.();
    router.refresh();
  }
  return { busy, error, run };
}

export function VoteButton({ type, id, discussionId, votes, voted, own }: { type: Target; id: string; discussionId: string; votes: number; voted: boolean; own: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => run(() => toggleVote(type, id, discussionId))}
        disabled={busy || own}
        aria-pressed={voted}
        title={own ? "You cannot upvote your own post" : undefined}
        className={cn(
          "inline-flex items-center gap-1 rounded-control border px-2 py-1 text-xs",
          voted ? "border-primary bg-primary-light text-primary" : "border-border text-text-secondary hover:bg-border-subtle",
          own && "cursor-not-allowed opacity-60",
        )}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
        <span>{votes}</span>
        <span className="sr-only">{voted ? " upvotes, you upvoted this" : " upvotes, upvote this"}</span>
      </button>
      {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function ReportButton({ type, id, discussionId, reported }: { type: Target; id: string; discussionId: string; reported: boolean }) {
  const { busy, error, run } = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (reported) return <span className="text-xs text-text-secondary">Reported</span>;
  return (
    <span className="inline-block">
      {open ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            run(() => reportContent(type, id, reason, discussionId), () => setOpen(false));
          }}
          className="mt-1 flex flex-wrap items-center gap-2"
          aria-label={`Report this ${type === "thread" ? "discussion" : "reply"}`}
        >
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What is wrong?" aria-label="Reason for the report" className="h-8 rounded-input border border-border bg-surface px-2 text-xs" />
          <Button type="submit" size="sm" loading={busy}>Send report</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text">
          <Flag className="size-3.5" aria-hidden="true" />
          Report<span className="sr-only"> this {type === "thread" ? "discussion" : "reply"}</span>
        </button>
      )}
      {error && <span role="alert" className="block text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function AnswerButton({ discussionId, postId, isAnswer }: { discussionId: string; postId: string; isAnswer: boolean }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-block">
      <button
        type="button"
        onClick={() => run(() => markAnswered(discussionId, isAnswer ? null : postId))}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text"
      >
        <CheckCircle2 className="size-3.5" aria-hidden="true" />
        {isAnswer ? "Unmark as answer" : "Mark as answer"}
      </button>
      {error && <span role="alert" className="block text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function DeleteButton({ type, id, discussionId, redirectTo }: { type: Target; id: string; discussionId: string; redirectTo?: string }) {
  const router = useRouter();
  const { busy, error, run } = useAction();
  const [confirming, setConfirming] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <Button size="sm" onClick={() => run(() => deleteOwn(type, id, discussionId), () => redirectTo && router.push(redirectTo))} loading={busy}>
            Confirm delete
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-danger-text">
          <Trash2 className="size-3.5" aria-hidden="true" />
          Delete<span className="sr-only"> this {type === "thread" ? "discussion" : "reply"}</span>
        </button>
      )}
      {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function ReplyForm({ discussionId }: { discussionId: string }) {
  const { busy, error, run } = useAction();
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        run(() => postReply(discussionId, body), () => setBody(""));
      }}
      noValidate
      aria-label="Write a reply"
      className="max-w-2xl space-y-3"
    >
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Your reply
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={BODY_MAX} disabled={busy} className="rounded-input border border-border bg-surface px-3 py-2 text-sm font-normal" />
      </label>
      {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      <Button type="submit" loading={busy}>Post reply</Button>
    </form>
  );
}
