"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Accordion, type AccordionItem } from "./accordion";

export interface FaqGroup {
  key: string;
  label: string;
  items: AccordionItem[];
}

// FAQs page from the design export: category pills filter the grouped accordions.
export function FaqBrowser({ groups }: { groups: FaqGroup[] }) {
  const [cat, setCat] = useState("all");
  const cats = [
    { key: "all", label: "All questions" },
    ...groups.map((g) => ({ key: g.key, label: g.label })),
  ];
  const shown = groups.filter((g) => cat === "all" || g.key === cat);

  return (
    <>
      <div role="group" aria-label="FAQ categories" className="mb-8 flex flex-wrap gap-1.5">
        {cats.map((c) => {
          const on = c.key === cat;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => setCat(c.key)}
              className={cn(
                "min-h-11 cursor-pointer rounded-full border-[1.5px] px-4 text-sm font-bold",
                on
                  ? "border-text bg-text text-white"
                  : "border-landing-outline bg-surface text-text",
              )}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-10">
        {shown.map((g) => (
          <div key={g.key} className="flex flex-col gap-3">
            <h2 className="text-[13px] font-extrabold tracking-[0.14em] text-primary-dark uppercase">
              {g.label}
            </h2>
            {/* The first question of the first group starts open, as in the export. */}
            <Accordion items={g.items} initialOpen={g.key === groups[0].key ? [0] : []} />
          </div>
        ))}
      </div>
    </>
  );
}
