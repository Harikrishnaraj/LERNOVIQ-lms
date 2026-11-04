import type { ReactNode } from "react";
import { PageHero, container, heroLead } from "@/components/marketing/ui";

// T-293 (F-447): shared layout for the privacy notice and terms. Text in [square brackets] marks a detail
// still awaiting the company's or counsel's decision (docs/GDPR_LEGAL_POSITIONS.md) and stays visible on
// purpose until it is filled in.
export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export function LegalPage({
  label,
  title,
  intro,
  updated,
  sections,
}: {
  label: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <PageHero label={label} title={title}>
        <p className={`${heroLead} max-w-[720px]`}>{intro}</p>
        <p className="mt-4 text-sm text-text-secondary">Last updated: {updated}</p>
      </PageHero>
      <div className={`${container} grid grid-cols-1 gap-10 py-14 lg:grid-cols-[240px_minmax(0,1fr)]`}>
        <nav aria-label="On this page" className="hidden lg:block">
          <ol className="sticky top-24 space-y-2 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-text-secondary hover:text-primary-dark">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0 max-w-[760px] space-y-10">
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-24">
              <h2 id={`${s.id}-h`} className="mb-3 text-2xl font-extrabold tracking-[-0.01em]">
                {s.title}
              </h2>
              <div className="legal-body space-y-3 text-[16px] leading-[1.7] text-landing-body [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_table]:text-left [&_table]:text-sm [&_td]:border-t [&_td]:border-border [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-bold [&_th]:text-text">
                {s.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

/** A small table that scrolls sideways on narrow screens instead of widening the page. */
export function LegalTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
