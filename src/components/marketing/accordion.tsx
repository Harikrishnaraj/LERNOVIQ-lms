"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface AccordionItem {
  q: string;
  a: string;
}

// Question/answer accordion from the design export (LMS and FAQs pages): +/− badge, blue border
// when open, aria-expanded/aria-controls. `initialOpen` lists the indexes that start open.
export function Accordion({
  items,
  initialOpen = [],
  single = false,
}: {
  items: AccordionItem[];
  initialOpen?: number[];
  /** Only one item open at a time (LMS page); otherwise each toggles independently (FAQs). */
  single?: boolean;
}) {
  const base = useId();
  const [open, setOpen] = useState<Set<number>>(() => new Set(initialOpen));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(single ? [] : prev);
      if (!prev.has(i)) next.add(i);
      return next;
    });

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        const bid = `${base}-q${i}`;
        const pid = `${base}-a${i}`;
        return (
          <div
            key={item.q}
            className={cn(
              "rounded-xl border bg-surface",
              isOpen ? "border-primary" : "border-border",
            )}
          >
            <h3>
              <button
                id={bid}
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                aria-controls={pid}
                className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 px-[22px] py-[18px] text-left text-[17px] leading-[1.4] font-bold"
              >
                {item.q}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-lg",
                    isOpen ? "bg-primary text-white" : "bg-primary-light text-primary-dark",
                  )}
                >
                  {isOpen ? "−" : "+"}
                </span>
              </button>
            </h3>
            {isOpen && (
              <div
                id={pid}
                role="region"
                aria-labelledby={bid}
                className="max-w-[760px] px-[22px] pb-[22px] text-base leading-[1.7] text-landing-body"
              >
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
