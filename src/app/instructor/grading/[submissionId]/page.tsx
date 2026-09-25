import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Paperclip } from "lucide-react";
import { GradeForm } from "@/components/assignments/grade-form";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getGradingQueue, getSubmissionForGrading } from "@/features/assignments/grading";
import { createClient } from "@/lib/supabase/server";
import { formatFileSize } from "@/lib/utils/format";
import { SUBMISSION_BUCKET, supabaseStorage } from "@/services/storage";

export const metadata: Metadata = { title: "Grade submission" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function GradeSubmissionPage({ params }: { params: Promise<{ submissionId: string }> }) {
  const { submissionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const sub = await getSubmissionForGrading(supabase, user.id, submissionId);
  if (!sub) notFound();
  const queue = await getGradingQueue(supabase);
  const learner = queue.find((r) => r.submissionId === sub.id)?.learnerName ?? "A learner";

  // The file is served through a short-lived signed URL; ownership was proven by reading the row.
  const fileUrl = sub.filePath ? await supabaseStorage.createSignedUrl(SUBMISSION_BUCKET, sub.filePath, 600).catch(() => null) : null;

  return (
    <>
      <Link href="/instructor/grading" className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Grading queue
      </Link>
      <PageHeader
        title={sub.assignmentTitle}
        description={`${learner} · submitted ${dateTime.format(new Date(sub.submittedAt))} UTC`}
        actions={
          <>
            {sub.isLate && <Badge tone="warning">Late</Badge>}
            {sub.status === "graded" && <Badge tone="success" dot>Graded {sub.grade}/{sub.maxPoints}</Badge>}
          </>
        }
      />

      <div className="space-y-6">
        <section aria-labelledby="work-heading" className="max-w-2xl space-y-2 rounded-card border border-border bg-surface p-5">
          <h2 id="work-heading" className="text-base font-semibold">
            Submitted work
          </h2>
          {sub.text ? <p className="text-sm whitespace-pre-wrap">{sub.text}</p> : <p className="text-sm text-text-secondary">No written answer.</p>}
          {sub.fileName && (
            <p className="inline-flex items-center gap-1 text-sm">
              <Paperclip className="size-4" aria-hidden="true" />
              {fileUrl ? (
                <a href={fileUrl} download={sub.fileName} rel="noopener noreferrer" className="text-primary underline">
                  {sub.fileName}
                </a>
              ) : (
                sub.fileName
              )}
              {sub.fileSize !== null && <span className="text-text-secondary">({formatFileSize(sub.fileSize)})</span>}
            </p>
          )}
        </section>

        <GradeForm
          submissionId={sub.id}
          maxPoints={sub.maxPoints}
          criteria={sub.criteria}
          initialScores={sub.scores}
          initialGrade={sub.grade}
          initialFeedback={sub.feedback}
          regrading={sub.status === "graded"}
        />
      </div>
    </>
  );
}
