import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Library, SearchX } from "lucide-react";
import { KnowledgeAutoRefresh } from "@/components/admin/knowledge-auto-refresh";
import { KnowledgeSourceActions } from "@/components/admin/knowledge-source-actions";
import { KnowledgeUploadForm } from "@/components/admin/knowledge-upload-form";
import { EmptyState, ErrorState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  KNOWLEDGE_PAGE_SIZE,
  getKnowledgeStatusCounts,
  listKnowledgeSources,
  listScopeOrganizations,
  listTestCourses,
  testKnowledgeRetrieval,
  type KnowledgeSourceRow,
  type SourceStatus,
} from "@/features/knowledge/admin";
import { parseKnowledgeQuery, type KnowledgeQuery } from "@/features/knowledge/admin-query";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Knowledge Base" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const STATUS: Record<SourceStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting", tone: "warning" },
  processing: { label: "Indexing", tone: "info" },
  ready: { label: "Ready", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
};

const KIND_LABEL: Record<KnowledgeSourceRow["kind"], string> = {
  lesson: "Lesson",
  lesson_asset: "Attachment",
  document: "Document",
};

function scopeLabel(scope: KnowledgeSourceRow["scope"]): string {
  if (scope.type === "course") {
    return scope.version ? `${scope.title} (v${scope.version})` : scope.title;
  }
  return scope.type === "organization" ? `${scope.name} only` : "Everyone (platform-wide)";
}

function href(q: KnowledgeQuery, over: Partial<KnowledgeQuery> = {}) {
  const m = { ...q, ...over };
  const params = new URLSearchParams();
  if (m.status) params.set("status", m.status);
  if (m.kind) params.set("kind", m.kind);
  if (m.q) params.set("q", m.q);
  if (m.page > 1) params.set("page", String(m.page));
  const qs = params.toString();
  return qs ? `/admin/knowledge?${qs}` : "/admin/knowledge";
}

function LoadFailed({ permission }: { permission: boolean }) {
  return permission ? (
    <PermissionDeniedState
      title="You cannot manage the knowledge base"
      description="Ask an administrator if you need access."
    />
  ) : (
    <ErrorState
      title="We could not load the knowledge base"
      description="Nothing was changed. Please try again."
      action={
        <Link href="/admin/knowledge" className={buttonClasses({ variant: "secondary" })}>
          Try again
        </Link>
      }
    />
  );
}

export default async function AdminKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseKnowledgeQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "knowledge.manage"))) {
    return (
      <>
        <PageHeader title="Knowledge Base" />
        <PermissionDeniedState
          title="You cannot manage the knowledge base"
          description="Ask an administrator if you need access."
        />
      </>
    );
  }

  const [counts, list, organizations, courses, test] = await Promise.all([
    getKnowledgeStatusCounts(supabase),
    listKnowledgeSources(supabase, {
      status: query.status || null,
      kind: query.kind || null,
      q: query.q,
      page: query.page,
    }),
    listScopeOrganizations(supabase),
    listTestCourses(supabase),
    query.test
      ? testKnowledgeRetrieval(supabase, query.test, {
          courseId: query.testCourse || null,
          organizationId: query.testOrganization || null,
        })
      : Promise.resolve(null),
  ]);

  if (!counts.ok || !list.ok) {
    return (
      <>
        <PageHeader title="Knowledge Base" />
        <LoadFailed
          permission={
            (!counts.ok && counts.error === "permission") ||
            (!list.ok && list.error === "permission")
          }
        />
      </>
    );
  }

  const { sources, total } = list.data;
  const pages = Math.max(1, Math.ceil(total / KNOWLEDGE_PAGE_SIZE));
  const filtered = query.status !== "" || query.kind !== "" || query.q !== "";
  const waiting = counts.data.pending + counts.data.processing;
  const nothingIndexed = counts.data.documents + counts.data.lessons === 0;

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        description="What the AI Tutor can search: published lessons and uploaded documents."
      />
      <KnowledgeAutoRefresh active={waiting > 0} />

      <div
        role="group"
        aria-label="Indexing status"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {(["ready", "pending", "processing", "failed"] as const).map((s) => (
          <Link
            key={s}
            href={href(query, { status: s, page: 1 })}
            className="rounded-card border border-border bg-surface p-4 hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-current={query.status === s ? "true" : undefined}
          >
            <p className="text-2xl font-bold text-text">{counts.data[s].toLocaleString("en-US")}</p>
            <p className="mt-1 text-sm text-text-secondary">{STATUS[s].label}</p>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Upload a document"
            description="Add reference material for the AI Tutor. Scanned (image-only) PDFs cannot be read."
          />
          <CardContent>
            <KnowledgeUploadForm organizations={organizations} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Test retrieval"
            description="See which passages a question finds, across every course and organization."
          />
          <CardContent>
            <form method="get" action="/admin/knowledge" role="search" className="space-y-3">
              <Input
                label="Question"
                name="tq"
                defaultValue={query.test}
                maxLength={500}
                required
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  label="Course (optional)"
                  name="tc"
                  defaultValue={query.testCourse}
                  placeholder="All courses"
                  options={courses.map((c) => ({ value: c.id, label: c.name }))}
                />
                <Select
                  label="Organization documents (optional)"
                  name="to"
                  defaultValue={query.testOrganization}
                  placeholder="All organizations"
                  options={organizations.map((o) => ({ value: o.id, label: o.name }))}
                />
              </div>
              <Button type="submit" variant="secondary">
                Test retrieval
              </Button>
            </form>

            {test && (
              <div className="mt-5" aria-live="polite">
                {!test.ok ? (
                  <p role="alert" className="text-sm text-danger-text">
                    {test.error === "permission"
                      ? "You do not have permission to test retrieval."
                      : "The test search failed. Please try again."}
                  </p>
                ) : test.data.length === 0 ? (
                  <p className="text-sm text-text-secondary">
                    No passages match this question. Check that the source is Ready, or try other
                    words.
                  </p>
                ) : (
                  <ol className="space-y-3" aria-label="Ranked passages">
                    {test.data.map((p, i) => (
                      <li key={p.chunkId} className="rounded-control border border-border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                          <span className="font-semibold text-text">#{i + 1}</span>
                          <span className="font-medium text-text">{p.title}</span>
                          <Badge
                            tone={
                              p.scope === "course"
                                ? "primary"
                                : p.scope === "organization"
                                  ? "info"
                                  : "neutral"
                            }
                          >
                            {p.scope === "course"
                              ? "Lesson"
                              : p.scope === "organization"
                                ? "Organization document"
                                : "Platform document"}
                          </Badge>
                          <span>score {p.rank.toFixed(3)}</span>
                        </div>
                        <p className="mt-2 text-sm whitespace-pre-wrap text-text">
                          {p.content.length > 700 ? `${p.content.slice(0, 700)}…` : p.content}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-text">
        Sources{" "}
        <span className="text-sm font-normal text-text-secondary">
          ({total.toLocaleString("en-US")})
        </span>
      </h2>

      <form
        method="get"
        action="/admin/knowledge"
        role="search"
        className="mb-4 flex flex-wrap items-end gap-2"
      >
        <div className="max-w-sm min-w-48 flex-1">
          <Input
            label="Search sources"
            type="search"
            name="q"
            defaultValue={query.q}
            maxLength={100}
            hint="Title or file name"
          />
        </div>
        <Select
          label="Status"
          name="status"
          defaultValue={query.status}
          placeholder="Any status"
          options={[
            { value: "ready", label: "Ready" },
            { value: "pending", label: "Waiting" },
            { value: "processing", label: "Indexing" },
            { value: "failed", label: "Failed" },
          ]}
        />
        <Select
          label="Kind"
          name="kind"
          defaultValue={query.kind}
          placeholder="Lessons and documents"
          options={[
            { value: "lesson", label: "Lessons" },
            { value: "document", label: "Documents" },
          ]}
        />
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {filtered && (
          <Link href="/admin/knowledge" className={buttonClasses({ variant: "ghost" })}>
            Clear filters
          </Link>
        )}
      </form>

      {sources.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No sources match"
            description="Try a different search, status or kind."
            action={
              <Link href="/admin/knowledge" className={buttonClasses({ variant: "secondary" })}>
                Clear filters
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={nothingIndexed ? Library : FileText}
            title="Nothing is indexed yet"
            description="Published lessons are indexed automatically. Upload a document above to add your own material."
          />
        )
      ) : (
        <>
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-border-subtle text-xs text-text-secondary uppercase">
                <tr>
                  <th scope="col" className="p-3">
                    Source
                  </th>
                  <th scope="col" className="p-3">
                    Scope
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                  <th scope="col" className="p-3">
                    Passages
                  </th>
                  <th scope="col" className="p-3">
                    Updated
                  </th>
                  <th scope="col" className="p-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle align-top">
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3">
                      <p className="font-medium text-text">{s.title}</p>
                      <p className="text-xs text-text-secondary">
                        {KIND_LABEL[s.kind]}
                        {s.fileName ? ` · ${s.fileName}` : ""}
                      </p>
                    </td>
                    <td className="p-3">{scopeLabel(s.scope)}</td>
                    <td className="p-3">
                      <Badge tone={STATUS[s.status].tone} dot>
                        {STATUS[s.status].label}
                      </Badge>
                      {s.error && (
                        <p
                          className="mt-1.5 max-w-xs text-xs text-danger-text"
                          data-testid="source-error"
                        >
                          {s.error}
                        </p>
                      )}
                    </td>
                    <td className="p-3">{s.chunkCount.toLocaleString("en-US")}</td>
                    <td className="p-3 whitespace-nowrap">
                      {dateFormat.format(new Date(s.updatedAt))}
                    </td>
                    <td className="p-3">
                      <KnowledgeSourceActions sourceId={s.id} title={s.title} kind={s.kind} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
              {query.page > 1 ? (
                <Link
                  href={href(query, { page: query.page - 1 })}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="text-text-secondary">
                Page {query.page} of {pages}
              </span>
              {query.page < pages ? (
                <Link
                  href={href(query, { page: query.page + 1 })}
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  Next
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
