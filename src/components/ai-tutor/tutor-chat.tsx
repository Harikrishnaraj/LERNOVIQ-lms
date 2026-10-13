"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, BookOpen, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_QUESTION_CHARS } from "@/features/ai/limits";
import type { TutorMode } from "@/features/ai/policy";
import type { TutorChatEntry } from "@/features/ai/tutor";
import { askTutor } from "@/features/ai/tutor-actions";
import { cn } from "@/lib/utils/cn";

export interface TutorChatProps {
  courseId: string;
  courseTitle: string;
  /** The lesson the learner is on (course player panel). */
  lessonId?: string | null;
  initialConversationId?: string | null;
  initialMessages?: TutorChatEntry[];
  mode: TutorMode;
  /** Re-render the page after an answer so its conversation list shows the new conversation. */
  refreshOnAnswer?: boolean;
  compact?: boolean;
}

/** Link to start a course discussion pre-filled with the question (PRD §12 escalation). */
export function discussionHref(courseId: string, question: string): string {
  const params = new URLSearchParams({ ask: courseId, q: question.slice(0, 1000) });
  return `/learner/discussions?${params.toString()}`;
}

export function TutorChat({
  courseId,
  courseTitle,
  lessonId = null,
  initialConversationId = null,
  initialMessages = [],
  mode: initialMode,
  refreshOnAnswer = false,
  compact = false,
}: TutorChatProps) {
  const router = useRouter();
  const inputId = useId();
  const [entries, setEntries] = useState<TutorChatEntry[]>(initialMessages);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [mode, setMode] = useState<TutorMode>(initialMode);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [entries.length, busy]);

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    const question = draft.trim();
    if (busy) return;
    if (!question) {
      setError("Type a question first.");
      return;
    }
    setBusy(true);
    setError(null);
    const pending: TutorChatEntry = {
      id: `question-${entries.length}`,
      role: "user",
      text: question,
      sources: [],
      escalate: false,
      truncated: false,
      failed: false,
    };
    setEntries((list) => [...list, pending]);

    const reply = await askTutor({ question, courseId, lessonId, conversationId }).catch(
      () => null,
    );
    setBusy(false);
    if (!reply || !reply.ok) {
      // Keep the question in the box so the learner can try again.
      setEntries((list) => list.filter((m) => m !== pending));
      if (reply?.conversationId) setConversationId(reply.conversationId);
      setError(reply?.error ?? "The AI Tutor isn't available right now. Try again later.");
      return;
    }
    setEntries((list) => [...list, reply.answer]);
    setConversationId(reply.conversationId);
    setMode(reply.mode);
    setDraft("");
    if (refreshOnAnswer) router.refresh();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) void ask(e);
  }

  function startOver() {
    setEntries([]);
    setConversationId(null);
    setError(null);
    setDraft("");
  }

  return (
    <section
      aria-label="AI Tutor chat"
      className="flex min-w-0 flex-col rounded-card border border-border bg-surface"
    >
      {mode === "hint_only" && (
        <p
          role="status"
          className="rounded-t-card bg-warning-light px-4 py-2 text-sm text-warning-text"
        >
          Hint-only mode: the tutor explains ideas and gives hints but not answers. It is on while
          you have a graded assessment in progress in this course, or when your administrator turns
          it on for everyone.
        </p>
      )}

      <div className={cn("overflow-y-auto p-4", compact ? "max-h-96" : "max-h-[60vh] min-h-64")}>
        {entries.length === 0 && !busy ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Sparkles className="size-6 text-primary" aria-hidden="true" />
            <p className="text-sm font-semibold">Ask about {courseTitle}</p>
            <p className="max-w-sm text-sm text-text-secondary">
              Answers come from your course lessons and link to the lessons they used.
            </p>
          </div>
        ) : (
          <ol aria-label="Conversation" aria-live="polite" className="space-y-4">
            {entries.map((m, i) => (
              <li key={m.id} className={cn("flex", m.role === "user" && "justify-end")}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] rounded-card bg-primary-light px-3 py-2 text-sm">
                    <span className="sr-only">You: </span>
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  </div>
                ) : (
                  <Answer
                    entry={m}
                    courseId={courseId}
                    question={entries[i - 1]?.role === "user" ? entries[i - 1].text : ""}
                  />
                )}
              </li>
            ))}
            {busy && (
              <li role="status" className="text-sm text-text-secondary">
                The AI Tutor is thinking…
              </li>
            )}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={ask} noValidate className="space-y-2 border-t border-border p-4">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
        <label htmlFor={inputId} className="text-sm font-medium">
          Your question
        </label>
        <textarea
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={compact ? 2 : 3}
          maxLength={MAX_QUESTION_CHARS}
          disabled={busy}
          placeholder="For example: what is the difference between the two approaches in this lesson?"
          className="w-full rounded-input border border-border bg-surface px-3 py-2 text-sm placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:bg-border-subtle"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={busy}>
            {busy ? "Asking…" : "Ask"}
          </Button>
          {entries.length > 0 && (
            <Button variant="ghost" onClick={startOver} disabled={busy}>
              New conversation
            </Button>
          )}
          <span className="ml-auto text-xs text-text-secondary">
            {draft.length}/{MAX_QUESTION_CHARS}
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          AI answers can be wrong. Check the linked lessons.
        </p>
      </form>
    </section>
  );
}

function Answer({
  entry,
  courseId,
  question,
}: {
  entry: TutorChatEntry;
  courseId: string;
  question: string;
}) {
  return (
    <div className="max-w-[95%] space-y-2 text-sm">
      <p className="text-xs font-semibold text-primary">AI Tutor</p>
      {entry.failed ? (
        <p className="text-text-secondary italic">No answer: the AI Tutor was unavailable.</p>
      ) : (
        <p className="whitespace-pre-wrap">{entry.text}</p>
      )}
      {entry.truncated && (
        <p className="text-xs text-text-secondary">
          This answer was cut short. Ask a narrower question for the rest.
        </p>
      )}
      {entry.sources.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-secondary">Sources</p>
          <ol aria-label="Sources" className="mt-1 space-y-1">
            {entry.sources.map((s) => (
              <li key={s.n} className="flex items-start gap-1.5 text-xs">
                <BookOpen
                  className="mt-0.5 size-3.5 shrink-0 text-text-secondary"
                  aria-hidden="true"
                />
                <span>
                  [{s.n}]{" "}
                  {s.href ? (
                    <Link href={s.href} className="font-medium text-primary hover:underline">
                      {s.title}
                    </Link>
                  ) : (
                    s.title
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {entry.escalate && question && (
        <Link
          href={discussionHref(courseId, question)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <MessageSquare className="size-3.5" aria-hidden="true" />
          Post this in the course discussion
        </Link>
      )}
    </div>
  );
}
