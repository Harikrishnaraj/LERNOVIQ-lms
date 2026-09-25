import { scaleBars, type InstructorDailyPoint } from "@/features/instructor/analytics";

export function InstructorTrendChart({ points }: { points: InstructorDailyPoint[] }) {
  const [enr, comp, act] = scaleBars([
    points.map((p) => p.enrollments),
    points.map((p) => p.completions),
    points.map((p) => p.activeLearners),
  ]);
  const w = 100 / Math.max(points.length, 1);
  const first = points[0]?.day;
  const last = points.at(-1)?.day;

  return (
    <figure className="space-y-3">
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Daily activity from ${first} to ${last}`}
        className="h-56 w-full rounded-card border border-border/40 bg-surface-subtle/50 p-2"
      >
        {points.map((p, i) => (
          <g key={p.day}>
            {/* Enrollments bar */}
            <rect
              x={i * w + w * 0.08}
              y={40 - (enr[i] ?? 0) * 0.36}
              width={w * 0.26}
              height={(enr[i] ?? 0) * 0.36}
              rx={1}
              className="fill-primary"
            >
              <title>{`${p.day}: ${p.enrollments} enrollments`}</title>
            </rect>
            {/* Completions bar */}
            <rect
              x={i * w + w * 0.37}
              y={40 - (comp[i] ?? 0) * 0.36}
              width={w * 0.26}
              height={(comp[i] ?? 0) * 0.36}
              rx={1}
              className="fill-success"
            >
              <title>{`${p.day}: ${p.completions} completions`}</title>
            </rect>
            {/* Active learners bar */}
            <rect
              x={i * w + w * 0.66}
              y={40 - (act[i] ?? 0) * 0.36}
              width={w * 0.26}
              height={(act[i] ?? 0) * 0.36}
              rx={1}
              className="fill-accent-purple"
            >
              <title>{`${p.day}: ${p.activeLearners} active learners`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" /> Enrollments
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="size-2.5 rounded-sm bg-success" aria-hidden="true" /> Completions
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="size-2.5 rounded-sm bg-accent-purple" aria-hidden="true" /> Active Learners
        </span>
        <span className="ml-auto font-mono text-[11px] text-text-muted">
          {first} to {last}
        </span>
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-primary hover:underline">
          View daily details table
        </summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-control border border-border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Daily student activity and revenue</caption>
            <thead className="sticky top-0 bg-surface-subtle font-semibold text-text">
              <tr>
                <th scope="col" className="p-2">Date</th>
                <th scope="col" className="p-2 text-right">Enrollments</th>
                <th scope="col" className="p-2 text-right">Completions</th>
                <th scope="col" className="p-2 text-right">Active Learners</th>
                <th scope="col" className="p-2 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle font-mono text-xs">
              {points.map((p) => (
                <tr key={p.day} className="hover:bg-surface-subtle/40">
                  <th scope="row" className="p-2 font-normal text-text-secondary">{p.day}</th>
                  <td className="p-2 text-right text-text">{p.enrollments}</td>
                  <td className="p-2 text-right text-text">{p.completions}</td>
                  <td className="p-2 text-right text-text">{p.activeLearners}</td>
                  <td className="p-2 text-right text-text">
                    {p.revenueCents > 0 ? `$${(p.revenueCents / 100).toFixed(2)}` : "$0.00"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
