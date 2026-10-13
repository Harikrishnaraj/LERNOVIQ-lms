import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContentClientPanel } from "@/components/admin/content-client-panel";
import { ContentLicenceCard } from "@/components/admin/content-licence-card";
import { ContentLicenceForm } from "@/components/admin/content-licence-form";
import { ContentOriginNotice } from "@/components/admin/content-origin-notice";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getClientUsage, getContentClient } from "@/features/content-server/queries";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { dispatchContentOrigin } from "@/services/content-server";

export const metadata: Metadata = { title: "Content Server customer" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function AdminContentClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "content_server.manage"))) {
    return (
      <>
        <PageHeader title="Content Server" />
        <PermissionDeniedState
          title="You cannot manage the content server"
          description="Ask an administrator if you need access."
        />
      </>
    );
  }
  if (!UUID.test(clientId)) notFound();

  const client = await getContentClient(supabase, clientId);
  if (!client) notFound();
  const usage = await getClientUsage(supabase, clientId);
  const dispatchAvailable = Boolean(dispatchContentOrigin());

  return (
    <>
      <PageHeader
        title={client.name}
        description={`${client.licences.length} ${client.licences.length === 1 ? "licence" : "licences"}`}
        actions={
          <Link href="/admin/content-server" className="text-sm text-primary hover:underline">
            ← Back to customers
          </Link>
        }
      />
      {!dispatchAvailable && <ContentOriginNotice />}
      <div className="space-y-10">
        <ContentClientPanel client={client} />

        <section aria-labelledby="licences-heading" className="space-y-3">
          <h2 id="licences-heading" className="text-base font-semibold">
            Licences
          </h2>
          {client.licences.length === 0 ? (
            <EmptyState
              title="No licences yet"
              description="Create a licence to choose courses, seats, an expiry date and the LMS addresses allowed to show them."
            />
          ) : (
            <div className="space-y-4">
              {client.licences.map((l) => (
                <ContentLicenceCard
                  key={l.id}
                  clientId={client.id}
                  licence={l}
                  dispatchAvailable={dispatchAvailable}
                />
              ))}
            </div>
          )}
          <div className="rounded-card border border-dashed border-border p-4">
            <h3 className="mb-3 text-sm font-semibold">New licence</h3>
            <ContentLicenceForm clientId={client.id} />
          </div>
        </section>

        <section aria-labelledby="usage-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="usage-heading" className="text-base font-semibold">
              Usage
            </h2>
            {usage.length > 0 && (
              <a
                href={`/admin/content-server/${client.id}/usage`}
                className="text-sm text-primary hover:underline"
              >
                Export usage (CSV)
              </a>
            )}
          </div>
          {usage.length === 0 ? (
            <EmptyState
              title="No launches yet"
              description="Learners appear here after they open a course from the customer's LMS. No names or emails are stored."
            />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">
                  Learners and launches per licence, course and month
                </caption>
                <thead className="bg-surface-subtle text-left text-xs tracking-wide text-text-secondary uppercase">
                  <tr>
                    <th scope="col" className="p-2.5">
                      Month
                    </th>
                    <th scope="col" className="p-2.5">
                      Licence
                    </th>
                    <th scope="col" className="p-2.5">
                      Course
                    </th>
                    <th scope="col" className="p-2.5 text-right">
                      New learners
                    </th>
                    <th scope="col" className="p-2.5 text-right">
                      Active learners
                    </th>
                    <th scope="col" className="p-2.5 text-right">
                      Launches
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {usage.map((r) => (
                    <tr key={`${r.licenceId}-${r.courseId}-${r.month}`}>
                      <td className="p-2.5">
                        {monthFormat.format(new Date(`${r.month}T00:00:00Z`))}
                      </td>
                      <td className="p-2.5">{r.licenceName}</td>
                      <td className="p-2.5">{r.courseTitle}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.newLearners}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.activeLearners}</td>
                      <td className="p-2.5 text-right tabular-nums">{r.launches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
