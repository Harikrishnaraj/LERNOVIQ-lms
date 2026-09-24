import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { getMyAssignments } from "@/features/assignments/queries";
import { STATUS_LABEL, type AssignmentStatus } from "@/features/assignments/rules";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Assignments" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const TONE: Record<AssignmentStatus, BadgeTone> = {
  open: "info",
  submitted: "primary",
  graded: "success",
  overdue: "danger",
  closed: "neutral",
};

export default async function LearnerAssignmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const assignments = await getMyAssignments(supabase, user.id);

  return (
    <>
      <PageHeader title="Assignments" description="Work to hand in for the courses you are enrolled in." />
      {assignments.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No assignments yet"
          description="Assignments from your courses will appear here with their deadlines."
        />
      ) : (
        <ul aria-label="Assignments" className="space-y-3">
          {assignments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4">
              <div className="min-w-0">
                <h2 className="font-semibold">
                  <Link href={`/learner/assignments/${a.id}`} className="hover:underline">
                    {a.title}
                  </Link>
                </h2>
                <p className="text-sm text-text-secondary">{a.courseTitle}</p>
                <p className="text-xs text-text-secondary">
                  {a.dueAt ? `Due ${dateTime.format(new Date(a.dueAt))} UTC` : "No deadline"}
                  {a.status === "graded" && a.submission?.grade !== null ? ` · ${a.submission?.grade}/${a.maxPoints}` : ""}
                </p>
              </div>
              <Badge tone={TONE[a.status]} dot>
                {STATUS_LABEL[a.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
