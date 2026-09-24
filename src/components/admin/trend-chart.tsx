import { scaleBars, type DailyPoint } from "@/features/admin/analytics";

/**
 * Grouped daily bars (enrollments, completions) as inline SVG, with the same numbers in a table
 * for screen readers and anyone who wants exact values.
 */
export function TrendChart({ points }: { points: DailyPoint[] }) {
  const [enr, comp] = scaleBars([points.map((p) => p.enrollments), points.map((p) => p.completions)]);
  const w = 100 / Math.max(points.length, 1);
  const first = points[0]?.day;
  const last = points.at(-1)?.day;

  return (
    <figure className="space-y-2">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily enrollments and completions from ${first} to ${last}`}
        className="h-48 w-full rounded-control bg-border-subtle"
      >
        {points.map((p, i) => (
          <g key={p.day}>
            <rect x={i * w + w * 0.1} y={40 - enr[i] * 0.38} width={w * 0.4} height={enr[i] * 0.38} className="fill-primary">
              <title>{`${p.day}: ${p.enrollments} enrollments`}</title>
            </rect>
            <rect x={i * w + w * 0.5} y={40 - comp[i] * 0.38} width={w * 0.4} height={comp[i] * 0.38} className="fill-success">
              <title>{`${p.day}: ${p.completions} completions`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm bg-primary" aria-hidden="true" /> Enrollments
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-3 rounded-sm bg-success" aria-hidden="true" /> Completions
        </span>
        <span className="ml-auto">
          {first} to {last}
        </span>
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer text-primary">View the numbers</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-control border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Daily platform activity</caption>
            <thead className="sticky top-0 bg-border-subtle">
              <tr>
                <th scope="col" className="p-2">Day</th>
                <th scope="col" className="p-2">Enrollments</th>
                <th scope="col" className="p-2">Completions</th>
                <th scope="col" className="p-2">Sign-ups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {points.map((p) => (
                <tr key={p.day}>
                  <th scope="row" className="p-2 font-normal">{p.day}</th>
                  <td className="p-2">{p.enrollments}</td>
                  <td className="p-2">{p.completions}</td>
                  <td className="p-2">{p.signups}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
