import Link from "next/link";
import { MessageSquareWarning } from "lucide-react";
import { ReopenButton } from "@/components/course-authoring/reopen-button";
import { buttonClasses } from "@/components/ui/button";
import { TARGET_LABEL, feedbackHref, type ReviewFeedback } from "@/features/course-authoring/feedback";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** What the reviewer said, section by section, with a link to fix each thing (F-211). */
export function ReviewFeedbackPanel({
  courseId,
  status,
  feedback,
}: {
  courseId: string;
  status: string;
  feedback: ReviewFeedback;
}) {
  const decision = feedback.latestDecision;
  if (!decision || (status !== "changes_requested" && status !== "rejected")) return null;
  const rejected = status === "rejected";

  return (
    <section
      aria-labelledby="feedback-heading"
      className="mb-8 space-y-4 rounded-card border border-warning bg-warning-light p-5 text-warning-text"
    >
      <div className="flex items-start gap-2">
        <MessageSquareWarning className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="feedback-heading" className="text-base font-semibold">
            {rejected ? "This submission was rejected" : "The reviewer asked for changes"}
          </h2>
          <p className="text-xs">{dateTime.format(new Date(decision.createdAt))} UTC</p>
          <p className="mt-2 text-sm whitespace-pre-wrap">{decision.note}</p>
        </div>
      </div>

      {feedback.notes.length > 0 && (
        <ul aria-label="Reviewer notes" className="space-y-2">
          {feedback.notes.map((n) => (
            <li key={n.id} className="rounded-control border border-warning bg-surface p-3 text-sm text-text">
              <p className="text-xs font-semibold text-text-secondary">
                {TARGET_LABEL[n.targetType]}
                {n.targetType !== "course" ? `: ${n.targetTitle}` : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
              <Link
                href={feedbackHref(courseId, n)}
                className="mt-2 inline-block text-sm font-medium text-primary underline"
              >
                Go to {n.targetType === "course" ? "course basics" : n.targetType === "section" ? "the curriculum" : "the lesson"}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rejected ? (
        <ReopenButton courseId={courseId} />
      ) : (
        <Link href={`/instructor/courses/${courseId}/submit`} className={buttonClasses({ variant: "secondary" })}>
          Resubmit when you are done
        </Link>
      )}
    </section>
  );
}
