"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Pin, PinOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { postReply } from "@/features/discussions/actions";
import { moderateContent, resolveReport, togglePin } from "@/features/instructor/discussion-actions";
import { cn } from "@/lib/utils/cn";

type Target = "thread" | "post";

function useInstructorAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Action failed.");
      return;
    }
    after?.();
    router.refresh();
  }

  return { busy, error, run };
}

export function InstructorPinButton({
  discussionId,
  pinned,
  variant = "ghost",
}: {
  discussionId: string;
  pinned: boolean;
  variant?: "ghost" | "button";
}) {
  const { busy, error, run } = useInstructorAction();

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => run(() => togglePin(discussionId))}
        disabled={busy}
        aria-pressed={pinned}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium transition-colors",
          variant === "button"
            ? cn(
                "rounded-control border px-2.5 py-1.5",
                pinned
                  ? "border-primary bg-primary-light text-primary"
                  : "border-border bg-surface text-text-secondary hover:text-text",
              )
            : cn(
                "hover:underline",
                pinned ? "text-primary font-semibold" : "text-text-secondary hover:text-text",
              ),
          busy && "opacity-50",
        )}
      >
        {pinned ? <PinOff className="size-3.5" aria-hidden="true" /> : <Pin className="size-3.5" aria-hidden="true" />}
        <span>{pinned ? "Unpin discussion" : "Pin discussion"}</span>
      </button>
      {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function InstructorModerateButton({
  type,
  id,
  hidden,
  discussionId,
}: {
  type: Target;
  id: string;
  hidden: boolean;
  discussionId: string;
}) {
  const { busy, error, run } = useInstructorAction();
  const [confirming, setConfirming] = useState(false);

  if (hidden) {
    return (
      <span className="inline-flex flex-col">
        <button
          type="button"
          onClick={() => run(() => moderateContent(type, id, false, discussionId))}
          disabled={busy}
          className="inline-flex items-center gap-1 text-xs text-success-text hover:underline"
        >
          <Eye className="size-3.5" aria-hidden="true" />
          <span>Unhide {type === "thread" ? "discussion" : "reply"}</span>
        </button>
        {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-control border border-danger/30 bg-danger-light p-1.5 text-xs text-danger-text">
        <span>Hide from learners?</span>
        <button
          type="button"
          onClick={() => run(() => moderateContent(type, id, true, discussionId), () => setConfirming(false))}
          disabled={busy}
          className="rounded px-2 py-0.5 font-medium bg-danger text-white hover:bg-danger/90"
        >
          Confirm hide
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded px-2 py-0.5 text-text-secondary hover:text-text"
        >
          Cancel
        </button>
        {error && <span role="alert" className="block w-full text-xs text-danger-text">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-danger-text hover:underline"
      >
        <EyeOff className="size-3.5" aria-hidden="true" />
        <span>Hide {type === "thread" ? "discussion" : "reply"}</span>
      </button>
      {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function InstructorResolveReportButton({
  type,
  id,
  discussionId,
}: {
  type: Target;
  id: string;
  discussionId: string;
}) {
  const { busy, error, run } = useInstructorAction();
  const [resolved, setResolved] = useState(false);

  if (resolved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success-text font-medium">
        <Check className="size-3.5" aria-hidden="true" />
        <span>Reports resolved</span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => run(() => resolveReport(type, id, discussionId), () => setResolved(true))}
        disabled={busy}
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
      >
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        <span>Resolve reports</span>
      </button>
      {error && <span role="alert" className="text-xs text-danger-text">{error}</span>}
    </span>
  );
}

export function InstructorReplyForm({ discussionId }: { discussionId: string }) {
  const { busy, error, run } = useInstructorAction();
  const [body, setBody] = useState("");

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        run(() => postReply(discussionId, body), () => setBody(""));
      }}
      aria-label="Instructor reply"
      className="space-y-3 rounded-card border border-primary/30 bg-surface p-4"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          Official Instructor Reply
        </span>
      </div>
      <label className="block text-sm">
        <span className="sr-only">Your instructor response</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Write your answer or instructions for the learner..."
          className="w-full rounded-input border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-secondary focus:border-primary focus:outline-hidden"
        />
      </label>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
      <div className="flex items-center justify-end">
        <Button type="submit" loading={busy} disabled={body.trim() === ""}>
          Post Instructor Reply
        </Button>
      </div>
    </form>
  );
}
