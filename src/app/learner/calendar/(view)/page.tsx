import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import {
  KIND_LABEL,
  VIEWS,
  daysBetween,
  groupByDay,
  monthGrid,
  parseCalendarQuery,
  periodLabel,
  shiftDate,
  visibleRange,
  ymd,
  type CalendarEvent,
  type CalendarQuery,
} from "@/features/calendar/calendar";
import { getCalendarEvents } from "@/features/calendar/events";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Calendar" };

const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const href = (q: CalendarQuery, over: Partial<CalendarQuery> = {}) => {
  const m = { ...q, ...over };
  return `/learner/calendar?view=${m.view}&date=${m.date}`;
};

const KIND_CLASS: Record<CalendarEvent["kind"], string> = {
  assignment_due: "border-warning bg-warning-light text-warning-text",
  assignment_submitted: "border-info bg-info-light text-info-text",
  assessment_taken: "border-primary bg-primary-light text-primary-dark",
  certificate: "border-success bg-success-light text-success-text",
};

function EventLink({ e, compact = false }: { e: CalendarEvent; compact?: boolean }) {
  return (
    <Link href={e.href} className={cn("block truncate rounded-control border px-1.5 py-0.5 text-xs", KIND_CLASS[e.kind])}>
      <span className="font-semibold">{KIND_LABEL[e.kind]}:</span> {e.title}
      {!compact && <span className="block text-[11px] opacity-80">{time.format(new Date(e.at))} UTC · {e.courseTitle}</span>}
    </Link>
  );
}

export default async function LearnerCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseCalendarQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const range = visibleRange(query);
  const events = await getCalendarEvents(supabase, user.id, range.from, range.to);
  const byDay = groupByDay(events);
  const today = ymd(new Date());
  const days = daysBetween(range.from, range.to);

  const agenda = (dayList: string[]) => {
    const withEvents = dayList.filter((d) => byDay.has(d));
    return withEvents.length === 0 ? (
      <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Deadlines, assessments and certificates in this period will show up here." />
    ) : (
      <ol aria-label="Agenda" className="space-y-4">
        {withEvents.map((d) => (
          <li key={d}>
            <h3 className={cn("mb-1 text-sm font-semibold", d === today && "text-primary")}>
              {dayLabel.format(new Date(`${d}T00:00:00Z`))}
              {d === today && <span className="ml-2 text-xs font-normal">Today</span>}
            </h3>
            <ul className="space-y-1.5">
              {byDay.get(d)!.map((e) => (
                <li key={e.id}>
                  <EventLink e={e} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    );
  };

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Deadlines, assessments and certificates. Times are in UTC."
        actions={
          <nav aria-label="Calendar view" className="inline-flex rounded-control border border-border">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={href(query, { view: v })}
                aria-current={v === query.view ? "true" : undefined}
                className={cn("px-3 py-1.5 text-sm capitalize", v === query.view ? "bg-primary-light font-semibold text-primary" : "text-text-secondary")}
              >
                {v}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={href(query, { date: shiftDate(query, -1) })} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label="Previous period">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Link>
        <Link href={href(query, { date: today })} className={buttonClasses({ variant: "secondary", size: "sm" })}>
          Today
        </Link>
        <Link href={href(query, { date: shiftDate(query, 1) })} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label="Next period">
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
        <h2 className="ml-2 text-lg font-semibold" aria-live="polite">
          {periodLabel(query)}
        </h2>
      </div>

      {query.view === "agenda" && agenda(days)}

      {query.view === "week" && (
        <div className="grid gap-3 md:grid-cols-7" role="list" aria-label="Week">
          {days.map((d, i) => (
            <div key={d} role="listitem" className={cn("min-h-24 rounded-card border bg-surface p-2", d === today ? "border-primary" : "border-border")}>
              <p className="mb-1 text-xs font-semibold text-text-secondary">
                {WEEKDAYS[i]} {d.slice(8)}
              </p>
              <ul className="space-y-1">
                {(byDay.get(d) ?? []).map((e) => (
                  <li key={e.id}>
                    <EventLink e={e} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {query.view === "month" && (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full table-fixed border-collapse text-left" aria-label={`Month of ${periodLabel(query)}`}>
              <thead>
                <tr>
                  {WEEKDAYS.map((w) => (
                    <th key={w} scope="col" className="border border-border bg-border-subtle p-2 text-xs font-semibold text-text-secondary">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {monthGrid(query).map((week) => (
                  <tr key={week[0].date}>
                    {week.map((day) => (
                      <td
                        key={day.date}
                        aria-label={dayLabel.format(new Date(`${day.date}T00:00:00Z`))}
                        className={cn("h-28 border border-border p-1.5 align-top", !day.inMonth && "bg-border-subtle/60 text-text-muted", day.date === today && "outline-2 -outline-offset-2 outline-primary")}
                      >
                        <p className="mb-1 text-xs font-semibold">{Number(day.date.slice(8))}</p>
                        <ul className="space-y-1">
                          {(byDay.get(day.date) ?? []).map((e) => (
                            <li key={e.id}>
                              <EventLink e={e} compact />
                            </li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden">{agenda(days.filter((d) => d.startsWith(query.date.slice(0, 7))))}</div>
        </>
      )}
    </>
  );
}
