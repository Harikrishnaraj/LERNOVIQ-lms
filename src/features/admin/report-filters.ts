import type { ReportType } from "./reports";

// T-290 (F-421): one filter model for every saved report. Date range is the existing range_days
// (access date on the usage reports); this adds course, user, organisation and status. Each report
// lists the filters that mean something for its rows, and anything else is refused, not ignored.

export interface ReportFilters {
  courseId?: string;
  userId?: string;
  organizationId?: string;
  status?: string;
}

export type ReportFilterKey = keyof ReportFilters;

const ENROLLMENT_STATUSES = ["active", "completed", "cancelled"];
const LICENCE_STATUSES = ["active", "expired", "revoked"];

interface FilterSupport {
  keys: ReportFilterKey[];
  statuses?: string[];
}

const NONE: FilterSupport = { keys: [] };

/** Which filters each report honours. */
export const REPORT_FILTER_SUPPORT: Record<ReportType, FilterSupport> = {
  daily_analytics: NONE,
  idle_users: { keys: ["userId", "organizationId"] },
  user_product_duration: { keys: ["courseId", "userId", "organizationId"] },
  individual_user_progress: { keys: ["courseId", "userId", "organizationId", "status"], statuses: ENROLLMENT_STATUSES },
  consolidated_course_module_usage: { keys: ["courseId"] },
  consolidated_course_library_usage: { keys: ["courseId"] },
  product_course_library_licence_status: { keys: ["status"], statuses: LICENCE_STATUSES },
  product_course_library_usage: { keys: ["courseId"] },
  product_course_module_usage: { keys: ["courseId"] },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LABELS: Record<ReportFilterKey, string> = {
  courseId: "Course",
  userId: "User",
  organizationId: "Organisation",
  status: "Status",
};

export function supportedFilters(type: ReportType): ReportFilterKey[] {
  return REPORT_FILTER_SUPPORT[type].keys;
}

export function statusOptions(type: ReportType): string[] {
  return REPORT_FILTER_SUPPORT[type].statuses ?? [];
}

export type ParsedFilters = { ok: true; value: ReportFilters } | { ok: false; error: string };

/** Cleans raw input (blank values dropped) and refuses unknown, unsupported or malformed filters. */
export function validateFilters(type: ReportType, raw: unknown): ParsedFilters {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Filters are not valid." };
  const support = REPORT_FILTER_SUPPORT[type];
  const value: ReportFilters = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) continue;
    if (!(key in LABELS)) return { ok: false, error: "Filters are not valid." };
    const k = key as ReportFilterKey;
    if (!support.keys.includes(k)) return { ok: false, error: `${LABELS[k]} filter does not apply to this report.` };
    if (typeof v !== "string") return { ok: false, error: `${LABELS[k]} filter is not valid.` };
    const s = v.trim();
    if (k === "status") {
      if (!support.statuses?.includes(s)) return { ok: false, error: "Choose a valid status." };
    } else if (!UUID.test(s)) {
      return { ok: false, error: `${LABELS[k]} filter is not valid.` };
    }
    value[k] = s;
  }
  return { ok: true, value };
}

/** Reads filters stored in saved_reports.filters; an unreadable value means no filters. */
export function parseStoredFilters(type: ReportType, stored: unknown): ReportFilters {
  const parsed = validateFilters(type, stored);
  return parsed.ok ? parsed.value : {};
}

/** Keeps rows where every set field of `want` equals the row's value (rows lacking the field are dropped). */
export function matchRows<T>(rows: T[], want: Partial<Record<string, string | undefined>>, get: (row: T, key: string) => string | null | undefined): T[] {
  const entries = Object.entries(want).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return rows;
  return rows.filter((row) => entries.every(([k, v]) => get(row, k) === v));
}

export function describeFilters(filters: ReportFilters): string {
  return (Object.keys(LABELS) as ReportFilterKey[])
    .filter((k) => filters[k])
    .map((k) => `${LABELS[k]}: ${k === "status" ? filters[k] : "selected"}`)
    .join(", ");
}
