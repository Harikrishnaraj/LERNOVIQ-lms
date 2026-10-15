"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { DELIVERY_STAGES } from "./delivery-stages";

// Interactive six-stage stepper from the design export (Delivery.dc.html): pressing a stage or
// Previous/Next updates the live detail panel.
export function DeliveryStepper() {
  const [i, setI] = useState(0);
  const cur = DELIVERY_STAGES[i];
  const last = DELIVERY_STAGES.length - 1;

  return (
    <>
      <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-2.5">
        {DELIVERY_STAGES.map((s, k) => {
          const on = k === i;
          const done = k < i;
          return (
            <li key={s.title} className="flex">
              <button
                type="button"
                onClick={() => setI(k)}
                aria-pressed={on}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-start gap-3 rounded-xl border-[1.5px] p-5 text-left",
                  on ? "border-primary bg-primary-light" : "border-border bg-surface",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <Image
                    src={s.icon}
                    alt=""
                    width={60}
                    height={60}
                    className="size-[60px] rounded-full"
                  />
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-extrabold",
                      on
                        ? "bg-primary text-white"
                        : done
                          ? "bg-text text-white"
                          : "bg-border-subtle text-text",
                    )}
                  >
                    {k + 1}
                  </span>
                </span>
                <span className="text-[17px] leading-[1.3] font-bold">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div
        aria-live="polite"
        className="mt-4 flex flex-wrap items-center justify-between gap-6 rounded-card border border-border bg-landing-tint px-[clamp(20px,4vw,40px)] py-8"
      >
        <div className="flex max-w-[760px] flex-col gap-2.5">
          <span className="text-[13px] font-extrabold tracking-[0.08em] text-primary-dark">
            STAGE 0{i + 1} OF 06
          </span>
          <h3 className="text-2xl font-extrabold">{cur.title}</h3>
          <p className="text-[17px] leading-[1.7] text-landing-body">{cur.detail}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setI(Math.max(0, i - 1))}
            disabled={i === 0}
            aria-label="Previous stage"
            className="size-12 cursor-pointer rounded-input border-[1.5px] border-landing-outline bg-surface text-lg disabled:cursor-default disabled:opacity-40"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setI(Math.min(last, i + 1))}
            disabled={i === last}
            aria-label="Next stage"
            className="size-12 cursor-pointer rounded-input bg-primary text-lg text-white disabled:cursor-default disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>
    </>
  );
}
