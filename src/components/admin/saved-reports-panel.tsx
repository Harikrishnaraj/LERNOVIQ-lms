"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2 } from "lucide-react";
import { createSavedReportAction, deleteSavedReportAction, runReportNowAction } from "@/features/admin/report-actions";
import { DEFAULT_REPORT_TYPE, REPORT_CATALOGUE, REPORT_CATEGORIES, type ReportType, type SavedReport } from "@/features/admin/reports";
import { describeFilters, statusOptions, supportedFilters } from "@/features/admin/report-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

function ReportRow({ report }: { report: SavedReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy("run");
    setError(null);
    const res = await runReportNowAction(report.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    const res = await deleteSavedReportAction(report.id);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="space-y-1 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{report.name}</p>
          <p className="text-xs text-text-secondary">
            {report.reportLabel} &middot; Last {report.rangeDays} days &middot; {describeFilters(report.filters) && `${describeFilters(report.filters)} · `} {report.schedule === "none" ? "Manual only" : `Auto-runs ${report.schedule}`}
            {report.nextRunAt && ` · next ${dateFormat.format(new Date(report.nextRunAt))}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={run} disabled={busy !== null}>
            {busy === "run" ? <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" /> : <Download className="mr-1.5 size-3.5" aria-hidden="true" />}
            Run now
          </Button>
          <button
            type="button"
            aria-label={`Delete ${report.name}`}
            disabled={busy !== null}
            onClick={remove}
            className="inline-flex size-8 items-center justify-center rounded-control text-text-secondary hover:bg-border-subtle hover:text-text disabled:opacity-40"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </li>
  );
}

export interface FilterOption {
  id: string;
  label: string;
}

const selectClass = "h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal";

export function SavedReportsPanel({
  reports,
  courses = [],
  organizations = [],
}: {
  reports: SavedReport[];
  courses?: FilterOption[];
  organizations?: FilterOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [reportType, setReportType] = useState<string>(DEFAULT_REPORT_TYPE);
  const [rangeDays, setRangeDays] = useState("30");
  const [schedule, setSchedule] = useState("none");
  const [filters, setFilters] = useState({ courseId: "", organizationId: "", userId: "", status: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supported = supportedFilters(reportType as ReportType);
  const statuses = statusOptions(reportType as ReportType);
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((f) => ({ ...f, [key]: value }));

  async function create() {
    if (name.trim() === "") return;
    setBusy(true);
    setError(null);
    const res = await createSavedReportAction({ name, reportType, rangeDays: Number(rangeDays),
      schedule,
      // Only the filters this report supports are sent; the server refuses any other.
      filters: Object.fromEntries(supported.map((k) => [k, filters[k]])),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Input label="Report name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} disabled={busy} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Report type
          <select value={reportType} onChange={(e) => {
              setReportType(e.target.value);
              setFilters({ courseId: "", organizationId: "", userId: "", status: "" });
            }} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            {REPORT_CATEGORIES.map((category) => (
              <optgroup key={category.id} label={category.label}>
                {REPORT_CATALOGUE.filter((r) => r.category === category.id).map((r) => (
                  <option key={r.type} value={r.type} disabled={!r.available}>
                    {r.available ? r.label : `${r.label} (Not available yet)`}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Range
          <select value={rangeDays} onChange={(e) => setRangeDays(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="7">7 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Schedule
          <select value={schedule} onChange={(e) => setSchedule(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="none">Manual only</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <Button type="button" variant="secondary" onClick={create} disabled={busy || name.trim() === "" || !REPORT_CATALOGUE.find((r) => r.type === reportType)?.available}>
          {busy && <Loader2 className="mr-1.5 size-3.5 animate-spin" aria-hidden="true" />}
          Save report
        </Button>
      </div>
      {supported.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          {supported.includes("courseId") && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Course
              <select value={filters.courseId} onChange={(e) => setFilter("courseId", e.target.value)} disabled={busy} className={selectClass}>
                <option value="">All courses</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {supported.includes("organizationId") && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Organisation
              <select value={filters.organizationId} onChange={(e) => setFilter("organizationId", e.target.value)} disabled={busy} className={selectClass}>
                <option value="">All organisations</option>
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {supported.includes("userId") && (
            <div className="min-w-64">
              <Input label="User ID (optional)" value={filters.userId} onChange={(e) => setFilter("userId", e.target.value)} disabled={busy} />
            </div>
          )}
          {supported.includes("status") && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Status
              <select value={filters.status} onChange={(e) => setFilter("status", e.target.value)} disabled={busy} className={selectClass}>
                <option value="">Any status</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}

      {reports.length === 0 ? (
        <p className="text-sm text-text-secondary">No saved reports yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
