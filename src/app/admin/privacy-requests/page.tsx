import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { PrivacyRequestForm } from "@/components/admin/privacy-request-form";
import { Badge } from "@/components/ui/badge";
import { listSubjectRequests } from "@/features/privacy/request-queries";
import { REQUEST_KINDS, slaState } from "@/features/privacy/requests";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Privacy requests" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

// T-286 (F-444): data-subject rights requests, soonest deadline first, with days left against the one-month limit.
export default async function AdminPrivacyRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "privacy.requests"))) {
    return (
      <>
        <PageHeader title="Privacy requests" />
        <PermissionDeniedState title="You cannot handle privacy requests" description="Ask an administrator if you need access." />
      </>
    );
  }

  const requests = await listSubjectRequests(supabase);
  return (
    <>
      <PageHeader
        title="Privacy requests"
        description="Access, correction, restriction, objection, portability and deletion requests. Each is due one month after it arrives."
      />
      {requests.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No privacy requests" description="Requests filed from Settings → Privacy will appear here." />
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const sla = slaState(r.dueAt, r.status);
            const closed = r.status === "completed" || r.status === "rejected";
            return (
              <li key={r.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{REQUEST_KINDS[r.kind]}</span>
                    <a href={`mailto:${r.requesterEmail}`} className="text-sm text-primary-dark underline">
                      {r.requesterEmail}
                    </a>
                    <Badge tone={closed ? "success" : "info"}>{r.status.replace("_", " ")}</Badge>
                  </div>
                  <span className="text-xs text-text-secondary">
                    Received {dateFormat.format(new Date(r.receivedAt))} · due {dateFormat.format(new Date(r.dueAt))}
                    {!closed && (
                      <>
                        {" · "}
                        <strong className={sla.overdue ? "text-danger-text" : undefined}>
                          {sla.overdue ? `${-sla.daysLeft} days overdue` : `${sla.daysLeft} days left`}
                        </strong>
                      </>
                    )}
                  </span>
                </div>
                {r.details && <p className="mt-3 text-sm whitespace-pre-line">{r.details}</p>}
                {r.resolutionNote && <p className="mt-2 text-sm text-text-secondary">Outcome: {r.resolutionNote}</p>}
                {!closed && <PrivacyRequestForm id={r.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
