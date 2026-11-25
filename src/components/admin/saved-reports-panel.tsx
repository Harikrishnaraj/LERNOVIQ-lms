"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Trash2 } from "lucide-react";
import { createSavedReportAction, deleteSavedReportAction, getExportDownloadUrlAction, runReportNowAction, type RunReportResult } from "@/features/admin/report-actions";
import { DEFAULT_REPORT_TYPE, REPORT_CATALOGUE, REPORT_CATEGORIES, describeReportRange, getReportDefinition, type ReportType, type SavedReport } from "@/features/admin/reports";
import { describeFilters, statusOptions, supportedFilters } from "@/features/admin/report-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** The signed link answers with Content-Disposition: attachment, so the page stays put while the file downloads.
 * Navigating (rather than window.open after an await) is not caught by popup blockers. */
function startDownload(url: string) {
  window.location.assign(url);
}

function ReportRow({ report }: { report: SavedReport }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(key: string, call: () => Promise<RunReportResult>, refresh: boolean) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const res = await call();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.notice) setNotice(res.notice);
      startDownload(res.url);
      if (refresh) router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      const res = await deleteSavedReportAction(report.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{report.name}</p>
          <p className="text-xs text-text-secondary">
            {report.reportLabel} &middot; {describeReportRange(report.reportType, report.rangeDays)} &middot; {describeFilters(report.filters) && `${describeFilters(report.filters)} · `} {report.schedule === "none" ? "Manual only" : `Auto-runs ${report.schedule}`}
            {report.nextRunAt && ` · next ${dateFormat.format(new Date(report.nextRunAt))} UTC`}
          </p>
          {report.filtersInvalid && (
            <p className="text-xs text-warning-text">This report&apos;s filters are no longer valid, so it can&apos;t run. Delete it and save it again.</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => act("run", () => runReportNowAction(report.id), true)} disabled={busy !== null}>
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
      {report.recentExports.length > 0 && (
        <ul aria-label={`Recent exports of ${report.name}`} className="space-y-1 border-l-2 border-border-subtle pl-3">
          {report.recentExports.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-secondary">
              <span>
                {dateFormat.format(new Date(x.generatedAt))} UTC &middot; {x.rowCount.toLocaleString("en-US")} {x.rowCount === 1 ? "row" : "rows"} &middot; {x.triggeredBy === "scheduled" ? "Scheduled" : "Manual"}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => act(x.id, () => getExportDownloadUrlAction(x.id), false)}
                aria-label={`Download the ${report.name} export from ${dateFormat.format(new Date(x.generatedAt))} UTC`}
                className="inline-flex items-center gap-1 rounded-control px-2 py-1 font-medium text-primary-dark hover:bg-border-subtle disabled:opacity-40"
              >
                {busy === x.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
                Download
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && <p role="status" className="text-xs text-warning-text">{notice}</p>}
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
  const usesRange = getReportDefinition(reportType)?.usesRange !== false;
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
        {usesRange ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Range
            <select value={rangeDays} onChange={(e) => setRangeDays(e.target.value)} disabled={busy} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </label>
        ) : (
          // Snapshot reports cover all time, so there is no range to pick (report audit C32, C50).
          <div className="flex flex-col gap-1.5 text-sm font-medium">
            Range
            <p className="flex h-10 items-center font-normal text-text-secondary">Current snapshot</p>
          </div>
        )}
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
