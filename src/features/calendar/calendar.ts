// Pure calendar maths (F-112). Everything is UTC so the server and browser always agree on which
// day an event falls on; the screen says "UTC". Weeks start on Monday.

export const VIEWS = ["month", "week", "agenda"] as const;
export type CalendarView = (typeof VIEWS)[number];

export type EventKind = "assignment_due" | "assignment_submitted" | "assessment_taken" | "certificate";

export interface CalendarEvent {
  id: string;
  /** ISO timestamp. */
  at: string;
  kind: EventKind;
  title: string;
  courseTitle: string;
  href: string;
}

export interface CalendarQuery {
  view: CalendarView;
  /** YYYY-MM-DD of the day the view is anchored on. */
  date: string;
}

const DAY_MS = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (ymdStr: string, n: number) => ymd(new Date(toDate(ymdStr).getTime() + n * DAY_MS));

export function isValidYmd(s: string): boolean {
  return DATE.test(s) && ymd(toDate(s)) === s;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseCalendarQuery(params: Params, today: Date = new Date()): CalendarQuery {
  const view = one(params.view);
  const date = one(params.date);
  return {
    view: (VIEWS as readonly string[]).includes(view) ? (view as CalendarView) : "month",
    date: isValidYmd(date) ? date : ymd(today),
  };
}

/** Monday of the week containing the given day. */
export function startOfWeek(day: string): string {
  const dow = (toDate(day).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(day, -dow);
}

export const AGENDA_DAYS = 30;

/** Half-open [from, to) range of days a view shows, as YYYY-MM-DD. */
export function visibleRange(q: CalendarQuery): { from: string; to: string } {
  if (q.view === "week") {
    const from = startOfWeek(q.date);
    return { from, to: addDays(from, 7) };
  }
  if (q.view === "agenda") return { from: q.date, to: addDays(q.date, AGENDA_DAYS) };
  const first = `${q.date.slice(0, 7)}-01`;
  const gridStart = startOfWeek(first);
  const next = ymd(new Date(Date.UTC(Number(q.date.slice(0, 4)), Number(q.date.slice(5, 7)), 1)));
  const last = addDays(next, -1);
  return { from: gridStart, to: addDays(startOfWeek(last), 7) };
}

/** Days from `from` (inclusive) to `to` (exclusive). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
}

export interface GridDay {
  date: string;
  inMonth: boolean;
}

/** Weeks (Monday first) covering the month of the anchor date. */
export function monthGrid(q: CalendarQuery): GridDay[][] {
  const { from, to } = visibleRange({ ...q, view: "month" });
  const month = q.date.slice(0, 7);
  const days = daysBetween(from, to).map((date) => ({ date, inMonth: date.startsWith(month) }));
  const weeks: GridDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return weeks;
}

/** The anchor after moving one step back (-1) or forward (+1) in the current view. */
export function shiftDate(q: CalendarQuery, direction: -1 | 1): string {
  if (q.view === "week") return addDays(q.date, 7 * direction);
  if (q.view === "agenda") return addDays(q.date, AGENDA_DAYS * direction);
  const y = Number(q.date.slice(0, 4));
  const m = Number(q.date.slice(5, 7)) - 1 + direction;
  return ymd(new Date(Date.UTC(y, m, 1)));
}

export function periodLabel(q: CalendarQuery): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(toDate(d));
  if (q.view === "month") return fmt(q.date, { month: "long", year: "numeric" });
  const { from, to } = visibleRange(q);
  const last = addDays(to, -1);
  return `${fmt(from, { month: "short", day: "numeric" })} to ${fmt(last, { month: "short", day: "numeric", year: "numeric" })}`;
}

/** Events keyed by their UTC day, each day sorted by time then title. */
export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const day = e.at.slice(0, 10);
    map.set(day, [...(map.get(day) ?? []), e]);
  }
  for (const list of map.values()) list.sort((a, b) => a.at.localeCompare(b.at) || a.title.localeCompare(b.title));
  return map;
}

export const KIND_LABEL: Record<EventKind, string> = {
  assignment_due: "Due",
  assignment_submitted: "Submitted",
  assessment_taken: "Assessment",
  certificate: "Certificate",
};
