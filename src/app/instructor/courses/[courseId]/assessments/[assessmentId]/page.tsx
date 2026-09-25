import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { AssessmentBuilder } from "@/components/course-authoring/assessment-builder";
import { BankPanel } from "@/components/course-authoring/bank-panel";
import { PageHeader } from "@/components/layout/page-header";
import { getAssessmentForAuthoring } from "@/features/course-authoring/assessments";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { listBankItems, parseBankQuery } from "@/features/question-bank/bank";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assessment builder" };

export default async function AssessmentBuilderPage({
  params,
}: {
  params: Promise<{ courseId: string; assessmentId: string }>;
}) {
  const { courseId, assessmentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();
  const assessment = await getAssessmentForAuthoring(supabase, course.version.id, assessmentId);
  if (!assessment) notFound();
  const bankItems = await listBankItems(supabase, parseBankQuery({}));

  return (
    <>
      <Link href={`/instructor/courses/${course.courseId}/assessments`} className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        All assessments
      </Link>
      <PageHeader title={assessment.title} description={`Assessment for ${course.version.title}`} />

      {!course.editable && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-card border border-warning bg-warning-light p-3 text-sm text-warning-text">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          This course is locked while it is in review or published, so this assessment cannot be changed.
        </p>
      )}

      <AssessmentBuilder courseId={course.courseId} assessment={assessment} disabled={!course.editable} />
      <BankPanel
        courseId={course.courseId}
        assessmentId={assessment.id}
        bankItems={bankItems}
        questions={assessment.questions.map((q) => ({ id: q.id, prompt: q.prompt }))}
        disabled={!course.editable}
      />
    </>
  );
}
