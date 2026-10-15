"use client";

import Image, { type StaticImageData } from "next/image";
import { useId, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils/cn";

export interface LmsTab {
  label: string;
  title: string;
  body: string;
  points: string[];
  image: StaticImageData;
  alt: string;
}

// "Where LERNOVIQ LMS is headed" tabbed preview from the design export (LMS.dc.html).
// Arrow keys move between tabs (WAI-ARIA tabs pattern).
export function LmsTabs({ tabs }: { tabs: LmsTab[] }) {
  const base = useId();
  const [active, setActive] = useState(0);
  const cur = tabs[active];

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (active + delta + tabs.length) % tabs.length;
    setActive(next);
    document.getElementById(`${base}-t${next}`)?.focus();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Product areas"
        className="mb-6 flex w-fit max-w-full flex-wrap gap-1.5 rounded-xl border border-border bg-surface p-1.5"
      >
        {tabs.map((t, i) => (
          <button
            key={t.label}
            id={`${base}-t${i}`}
            role="tab"
            type="button"
            aria-selected={i === active}
            aria-controls={`${base}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKey}
            className={cn(
              "min-h-11 cursor-pointer rounded-control px-4 text-sm font-bold",
              i === active ? "bg-text text-white" : "text-landing-body",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={`${base}-t${active}`}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] items-center gap-x-12 gap-y-8"
      >
        <div className="flex max-w-[440px] flex-col gap-4">
          <span className="self-start rounded-md bg-warning-light px-2.5 py-[5px] text-xs font-extrabold tracking-[0.06em] text-warning-text uppercase">
            Product direction
          </span>
          <h3 className="text-[26px] leading-[1.2] font-extrabold">{cur.title}</h3>
          <p className="text-base leading-[1.7] text-pretty text-landing-body">{cur.body}</p>
          <ul className="flex flex-col gap-2.5">
            {cur.points.map((p) => (
              <li key={p} className="flex items-baseline gap-2.5 text-[15px] leading-[1.5]">
                <span
                  className="size-1.5 shrink-0 -translate-y-0.5 bg-primary"
                  aria-hidden="true"
                />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <figure className="m-0 flex min-w-0 flex-col gap-2.5">
          <div className="overflow-hidden rounded-card border border-border bg-surface shadow-[0_24px_48px_-32px_rgba(10,31,84,0.45)]">
            <Image
              src={cur.image}
              alt={cur.alt}
              sizes="(min-width: 1024px) 640px, 100vw"
              className="aspect-[16/10] w-full object-cover object-top-left"
            />
          </div>
          <figcaption className="text-[13px] text-neutral-text">
            Product design concept. Not a screenshot of a released feature.
          </figcaption>
        </figure>
      </div>
    </>
  );
}
