import type { UsageDay } from "@/features/admin/ai-management";
import { formatUsd } from "@/features/admin/ai-management";

/**
 * Questions per day as stacked bars (answered by the model, "not in the course" answers, failures)
 * in inline SVG, with the same numbers in a table for screen readers and exact values.
 */
export function AiUsageChart({ days }: { days: UsageDay[] }) {
  const stacks = days.map((d) => ({
    answered: d.answered,
    noSources: d.noSources,
    failed: d.failed,
    total: d.answered + d.noSources + d.failed,
  }));
  const max = Math.max(1, ...stacks.map((s) => s.total));
  const w = 100 / Math.max(days.length, 1);
  const H = 38;
  const first = days[0]?.day;
  const last = days.at(-1)?.day;

  return (
    <figure className="space-y-2">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`AI Tutor answers per day from ${first} to ${last}`}
        className="h-48 w-full rounded-control bg-border-subtle"
      >
        {days.map((d, i) => {
          const s = stacks[i];
          const hAnswered = (s.answered / max) * H;
          const hNoSources = (s.noSources / max) * H;
          const hFailed = (s.failed / max) * H;
          const x = i * w + w * 0.15;
          const bw = w * 0.7;
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${s.answered} answered, ${s.noSources} not in the course, ${s.failed} failed`}</title>
              <rect
                x={x}
                y={40 - hAnswered}
                width={bw}
                height={hAnswered}
                className="fill-primary"
              />
              <rect
                x={x}
                y={40 - hAnswered - hNoSources}
                width={bw}
                height={hNoSources}
                className="fill-text-muted"
              />
              <rect
                x={x}
                y={40 - hAnswered - hNoSources - hFailed}
                width={bw}
                height={hFailed}
                className="fill-danger"
              />
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm bg-primary" aria-hidden="true" /> Answered
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm bg-text-muted" aria-hidden="true" /> Not in the course
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm bg-danger" aria-hidden="true" /> Failed
        </span>
        <span className="ml-auto">
          {first} to {last}
        </span>
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">View the numbers</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-control border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">AI Tutor usage per day</caption>
            <thead className="sticky top-0 bg-border-subtle">
              <tr>
                <th scope="col" className="p-2">
                  Day
                </th>
                <th scope="col" className="p-2">
                  Questions
                </th>
                <th scope="col" className="p-2">
                  Answered
                </th>
                <th scope="col" className="p-2">
                  Not in the course
                </th>
                <th scope="col" className="p-2">
                  Failed
                </th>
                <th scope="col" className="p-2">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {days.map((d) => (
                <tr key={d.day}>
                  <th scope="row" className="p-2 font-normal">
                    {d.day}
                  </th>
                  <td className="p-2">{d.questions}</td>
                  <td className="p-2">{d.answered}</td>
                  <td className="p-2">{d.noSources}</td>
                  <td className="p-2">{d.failed}</td>
                  <td className="p-2">{d.costUsd === null ? "-" : formatUsd(d.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
