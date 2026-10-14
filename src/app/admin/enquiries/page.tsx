import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Inbox } from "lucide-react";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { listEnquiries } from "@/features/enquiries/queries";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Enquiries" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

// T-264 (F-963, ADR-042): enquiries sent from the marketing site's contact form, newest first.
export default async function AdminEnquiriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "enquiry.read"))) {
    return (
      <>
        <PageHeader title="Enquiries" />
        <PermissionDeniedState title="You cannot read enquiries" description="Ask an administrator if you need access." />
      </>
    );
  }

  const enquiries = await listEnquiries(supabase);

  return (
    <>
      <PageHeader title="Enquiries" description="Consultation and LMS demo requests from the website’s contact form." />
      {enquiries.length === 0 ? (
        <EmptyState icon={Inbox} title="No enquiries yet" description="Messages sent from the website’s Contact page will appear here." />
      ) : (
        <ul className="space-y-3">
          {enquiries.map((e) => (
            <li key={e.id} className="rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.name}</span>
                  <span className="text-sm text-text-secondary">{e.organization}</span>
                  <Badge tone={e.kind === "demo" ? "info" : "neutral"}>{e.kind === "demo" ? "LMS demo" : "Consultation"}</Badge>
                </div>
                <time dateTime={e.createdAt} className="text-xs text-text-secondary">
                  {dateFormat.format(new Date(e.createdAt))} UTC
                </time>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {(
                  [
                    ["Email", <a key="m" href={`mailto:${e.email}`} className="text-primary-dark underline">{e.email}</a>],
                    ["Country or region", e.country],
                    ["Industry", e.industry],
                    ["Solution of interest", e.solution],
                    ["Learner audience", e.audience],
                    ["Timeline", e.timeline],
                  ] as const
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="text-text-secondary">{k}:</dt>
                      <dd className="min-w-0 break-words">{v}</dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-3 text-sm whitespace-pre-line">{e.details}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
