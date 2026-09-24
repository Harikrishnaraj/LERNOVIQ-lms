import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, History, SearchX } from "lucide-react";
import { EmptyState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUDIT_PAGE_SIZE, getAuditPage, parseAuditQuery, type AuditQuery } from "@/features/admin/audit";
import { describeAction } from "@/features/admin/overview";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_ACTIONS } from "@/services/audit";

export const metadata: Metadata = { title: "Audit log" };

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });

function qs(f: AuditQuery, over: Partial<AuditQuery> = {}) {
  const m = { ...f, ...over };
  const params = new URLSearchParams();
  for (const k of ["action", "actor", "resourceType", "resourceId", "from", "to"] as const) if (m[k]) params.set(k, m[k]);
  if (m.page > 1) params.set("page", String(m.page));
  return params.toString();
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseAuditQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "audit.read"))) {
    return (
      <>
        <PageHeader title="Audit log" />
        <PermissionDeniedState title="You cannot view the audit log" description="Ask a super admin if you need access." />
      </>
    );
  }

  const { rows, total } = await getAuditPage(supabase, filters);
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const filtered = qs({ ...filters, page: 1 }) !== "";
  const exportQs = qs({ ...filters, page: 1 });

  return (
    <>
      <PageHeader
        title="Audit log"
        description={`${total.toLocaleString("en-US")} ${total === 1 ? "event" : "events"}. Records cannot be edited or deleted.`}
        actions={
          <a href={`/admin/audit/export${exportQs ? `?${exportQs}` : ""}`} className={buttonClasses({ variant: "secondary" })}>
            <Download className="size-4" aria-hidden="true" />
            Export CSV
          </a>
        }
      />

      <form method="get" action="/admin/audit" role="search" aria-label="Filter the audit log" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Action
          <select name="action" defaultValue={filters.action} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All actions</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {describeAction(a)}
              </option>
            ))}
          </select>
        </label>
        <Input label="Actor email" name="actor" defaultValue={filters.actor} maxLength={100} />
        <Input label="Resource type" name="resourceType" defaultValue={filters.resourceType} maxLength={100} hint="e.g. course, user" />
        <Input label="Resource ID" name="resourceId" defaultValue={filters.resourceId} maxLength={100} />
        <Input label="From" type="date" name="from" defaultValue={filters.from} />
        <Input label="To" type="date" name="to" defaultValue={filters.to} />
        <div className="flex items-end gap-2">
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {filtered && (
            <Link href="/admin/audit" className={buttonClasses({ variant: "secondary" })}>
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchX} title="No events match" description="Try widening the filters or the date range." />
        ) : (
          <EmptyState icon={History} title="No events yet" description="Privileged actions such as reviews and role changes are recorded here." />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">Time (UTC)</th>
                  <th scope="col" className="p-3">Actor</th>
                  <th scope="col" className="p-3">Action</th>
                  <th scope="col" className="p-3">Resource</th>
                  <th scope="col" className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 whitespace-nowrap">{dateTime.format(new Date(r.createdAt))}</td>
                    <td className="p-3">{r.actorEmail ?? "System"}</td>
                    <td className="p-3 font-medium">{describeAction(r.action)}</td>
                    <td className="p-3">
                      {r.resourceType}
                      {r.resourceId && <span className="block max-w-48 truncate text-xs text-text-secondary">{r.resourceId}</span>}
                    </td>
                    <td className="p-3">
                      {Object.keys(r.metadata).length > 0 ? (
                        <code className="block max-w-64 truncate text-xs" title={JSON.stringify(r.metadata)}>
                          {JSON.stringify(r.metadata)}
                        </code>
                      ) : (
                        <span className="text-text-muted">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {filters.page > 1 ? (
                <Link href={`/admin/audit?${qs(filters, { page: filters.page - 1 })}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {filters.page} of {pages}
              </span>
              {filters.page < pages ? (
                <Link href={`/admin/audit?${qs(filters, { page: filters.page + 1 })}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Older
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
