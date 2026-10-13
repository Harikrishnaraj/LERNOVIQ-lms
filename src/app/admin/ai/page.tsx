import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, UserCheck } from "lucide-react";
import { AiSettingsForm } from "@/components/admin/ai-settings-form";
import { AiUsageChart } from "@/components/admin/ai-usage-chart";
import { EmptyState, ErrorState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  USAGE_PERIODS,
  costLabel,
  getAiUsageReport,
  listAiTutorAccess,
  parseUsagePeriod,
  totalFailures,
  type AiTutorAccessList,
  type AiUsageReport,
} from "@/features/admin/ai-management";
import { getAiSettings } from "@/features/ai/settings";
import { type AiSettings } from "@/features/ai/settings-rules";
import { log } from "@/lib/log";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";
import { describeChatProvider } from "@/services/ai";

export const metadata: Metadata = { title: "AI Management" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const count = (n: number) => n.toLocaleString("en-US");

type Loaded<T> = { ok: true; value: T } | { ok: false };

async function load<T>(what: string, run: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    log.error("admin.ai.load_failed", {
      what,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false };
  }
}

function SectionError({ what }: { what: string }) {
  return (
    <ErrorState
      title={`We could not load ${what}`}
      description="Nothing was changed. Reload the page to try again."
    />
  );
}

// Admin AI management (T-204, F-704, ADR-045): usage and cost, the tutor's settings and who has
// the tutor. Each section needs its own permission and is shown only when the admin holds it.
export default async function AdminAiPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const days = parseUsagePeriod((await searchParams).days);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [canUsage, canSettings, canAccess] = await Promise.all([
    can(supabase, user.id, "ai.read_all"),
    can(supabase, user.id, "ai.manage_settings"),
    can(supabase, user.id, "ai.manage_access"),
  ]);

  if (!canUsage && !canSettings && !canAccess) {
    return (
      <>
        <PageHeader title="AI Management" />
        <PermissionDeniedState
          title="You cannot view AI management"
          description="Ask an administrator if you need access."
        />
      </>
    );
  }

  const [settings, usage, access] = await Promise.all([
    canSettings ? load("settings", () => requireSettings(supabase)) : null,
    canUsage ? load("usage", () => getAiUsageReport(supabase, days)) : null,
    canAccess ? load("access", () => listAiTutorAccess(supabase)) : null,
  ]);

  return (
    <>
      <PageHeader
        title="AI Management"
        description="Turn the AI Tutor on or off, choose its model and limits, and see what it costs."
        actions={
          canUsage ? (
            <nav aria-label="Period" className="inline-flex rounded-control border border-border">
              {USAGE_PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/admin/ai?days=${p}`}
                  aria-current={p === days ? "true" : undefined}
                  className={cn(
                    "px-3 py-1.5 text-sm",
                    p === days
                      ? "bg-primary-light font-semibold text-primary"
                      : "text-text-secondary",
                  )}
                >
                  {p} days
                </Link>
              ))}
            </nav>
          ) : undefined
        }
      />

      <div className="space-y-6">
        {settings && (
          <Card>
            <CardHeader
              title="Model and limits"
              description="Applied to the very next question a learner asks."
            />
            <CardContent>
              {settings.ok ? (
                <SettingsSection settings={settings.value} />
              ) : (
                <SectionError what="the AI settings" />
              )}
            </CardContent>
          </Card>
        )}

        {usage &&
          (usage.ok ? (
            <UsageSection report={usage.value} />
          ) : (
            <Card>
              <CardHeader title="Usage and cost" />
              <CardContent>
                <SectionError what="AI usage" />
              </CardContent>
            </Card>
          ))}

        {access && (
          <Card>
            <CardHeader
              title="AI Tutor access"
              description="Learners an administrator has turned the AI Tutor on for. Turn it on or off for one person on their user page."
            />
            <CardContent>
              {access.ok ? (
                <AccessSection list={access.value} />
              ) : (
                <SectionError what="the access list" />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

async function requireSettings(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<AiSettings> {
  const settings = await getAiSettings(supabase);
  if (!settings) throw new Error("ai_settings unreadable");
  return settings;
}

function SettingsSection({ settings }: { settings: AiSettings }) {
  const provider = describeChatProvider();
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Provider:{" "}
        <span className="font-medium text-text">
          {provider.provider === "fake" ? "Offline test provider" : "Groq"}
        </span>{" "}
        {provider.configured ? (
          <Badge tone="success">Key configured</Badge>
        ) : (
          <Badge tone="warning">Key missing: the tutor cannot answer</Badge>
        )}
      </p>
      <AiSettingsForm settings={settings} defaultModel={provider.defaultModel} />
    </div>
  );
}

function UsageSection({ report }: { report: AiUsageReport }) {
  const t = report.totals;
  const failures = totalFailures(t);
  const empty = t.questions === 0 && t.answered === 0 && t.noSources === 0 && failures === 0;

  const tiles = [
    { label: "Questions asked", value: count(t.questions) },
    { label: "Answered by the model", value: count(t.answered) },
    {
      label: "Not in the course",
      value: count(t.noSources),
      note: "Fixed reply, no model call, no cost",
    },
    {
      label: "Failed",
      value: count(failures),
      note: `${t.failed.timeout} timed out, ${t.failed.rateLimited} busy, ${t.failed.error} error, ${t.failed.notConfigured} not configured`,
    },
    { label: "Cost", value: costLabel(t.costUsd, t.unpriced) },
    {
      label: "Tokens",
      value: `${count(t.inputTokens)} in / ${count(t.outputTokens)} out`,
    },
    {
      label: "Average response time",
      value: t.avgLatencyMs === null ? "No answers yet" : `${(t.avgLatencyMs / 1000).toFixed(1)} s`,
    },
  ];

  return (
    <>
      <dl
        aria-label={`Totals for the last ${report.days} days`}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {tiles.map((k) => (
          <Card key={k.label} className="p-4">
            <dt className="text-sm text-text-secondary">{k.label}</dt>
            <dd className="mt-1 text-xl font-bold">{k.value}</dd>
            {k.note && <p className="mt-1 text-xs text-text-secondary">{k.note}</p>}
          </Card>
        ))}
      </dl>

      {empty ? (
        <EmptyState
          icon={Bot}
          title="No AI Tutor activity in this period"
          description="Questions, answers and cost will appear here once learners use the tutor."
        />
      ) : (
        <>
          <Card>
            <CardHeader title="Questions per day" description={`Last ${report.days} days, UTC`} />
            <CardContent>
              <AiUsageChart days={report.daily} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By model" />
              <CardContent>
                {report.byModel.length === 0 ? (
                  <p className="text-sm text-text-secondary">No model answers in this period.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="sr-only">Usage by model</caption>
                      <thead className="text-xs text-text-secondary">
                        <tr>
                          <th scope="col" className="py-1.5 pr-3 font-medium">
                            Model
                          </th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">
                            Answered
                          </th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">
                            Failed
                          </th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">
                            Tokens in / out
                          </th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">
                            Avg time
                          </th>
                          <th scope="col" className="py-1.5 font-medium">
                            Cost
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {report.byModel.map((m) => (
                          <tr key={m.model}>
                            <th scope="row" className="py-2 pr-3 font-medium">
                              {m.model}
                            </th>
                            <td className="py-2 pr-3">{count(m.answered)}</td>
                            <td className="py-2 pr-3">{count(m.failed)}</td>
                            <td className="py-2 pr-3">
                              {count(m.inputTokens)} / {count(m.outputTokens)}
                            </td>
                            <td className="py-2 pr-3">
                              {m.avgLatencyMs === null
                                ? "-"
                                : `${(m.avgLatencyMs / 1000).toFixed(1)} s`}
                            </td>
                            <td className="py-2">{costLabel(m.costUsd, m.unpriced)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Top users" description="By questions asked" />
              <CardContent>
                {report.topUsers.length === 0 ? (
                  <p className="text-sm text-text-secondary">No questions in this period.</p>
                ) : (
                  <ol aria-label="Top users by questions" className="space-y-2">
                    {report.topUsers.map((u, i) => (
                      <li
                        key={u.userId}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          {i + 1}.{" "}
                          <Link
                            href={`/admin/users/${u.userId}`}
                            className="font-medium hover:underline"
                          >
                            {u.name ?? u.email ?? "Unnamed user"}
                          </Link>
                          {u.name && u.email && (
                            <span className="text-text-secondary"> ({u.email})</span>
                          )}
                        </span>
                        <span className="shrink-0 text-text-secondary">
                          {count(u.questions)} questions &middot;{" "}
                          {u.costUsd === null ? "Unknown price" : costLabel(u.costUsd, 0)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function AccessSection({ list }: { list: AiTutorAccessList }) {
  if (list.total === 0) {
    return (
      <EmptyState
        icon={UserCheck}
        title="No one has the AI Tutor yet"
        description="It is off for everyone until an administrator turns it on from a user's page."
        action={
          <Link href="/admin/users" className="text-sm font-medium text-primary hover:underline">
            Go to users
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="font-semibold">{count(list.total)}</span>{" "}
        {list.total === 1 ? "user has" : "users have"} the AI Tutor turned on.
        {list.total > list.users.length && (
          <span className="text-text-secondary"> Showing the {list.users.length} most recent.</span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Users with AI Tutor access</caption>
          <thead className="text-xs text-text-secondary">
            <tr>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                User
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Email
              </th>
              <th scope="col" className="py-1.5 pr-3 font-medium">
                Turned on by
              </th>
              <th scope="col" className="py-1.5 font-medium">
                Turned on
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {list.users.map((u) => (
              <tr key={u.userId}>
                <th scope="row" className="py-2 pr-3 font-medium">
                  <Link href={`/admin/users/${u.userId}`} className="hover:underline">
                    {u.name ?? "Unnamed user"}
                  </Link>
                </th>
                <td className="py-2 pr-3">{u.email ?? "-"}</td>
                <td className="py-2 pr-3">{u.grantedByName ?? "Unknown"}</td>
                <td className="py-2">{dateFormat.format(new Date(u.grantedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
