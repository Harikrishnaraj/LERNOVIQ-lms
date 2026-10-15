import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

// Shared look of the marketing pages, taken from the Claude Design export (ADR-042,
// "Lernoviq landing page design/export/website-v2/documentation/design-system.md").

export const container = "mx-auto max-w-[1240px] px-6";
export const eyebrow = "text-xs font-extrabold tracking-[0.14em] text-primary-dark uppercase";
export const eyebrowOnDark =
  "text-xs font-extrabold tracking-[0.14em] text-landing-on-dark-accent uppercase";
export const h1 =
  "text-[clamp(34px,4.6vw,56px)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance";
export const h2 =
  "text-[clamp(28px,3.4vw,42px)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance";
export const h2Sm =
  "text-[clamp(26px,3vw,36px)] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance";
export const lead = "text-[17px] leading-[1.7] text-landing-body text-pretty";
export const heroLead = "text-lg leading-[1.65] text-landing-body text-pretty";
export const textLink = "py-2 text-[15px] font-bold text-primary-dark hover:text-text";
export const btnPrimary =
  "inline-flex items-center justify-center rounded-input bg-primary px-[26px] py-4 text-base font-bold text-white hover:bg-primary-dark";
export const btnOutline =
  "inline-flex items-center justify-center rounded-input border-[1.5px] border-landing-outline bg-surface px-[26px] py-4 text-base font-bold text-text hover:border-primary hover:text-primary-dark";
export const btnOutlineSm =
  "inline-flex items-center justify-center self-start rounded-input border-[1.5px] border-landing-outline px-5 py-[13px] text-[15px] font-bold text-text hover:border-primary hover:text-primary-dark";
export const btnWhite =
  "inline-flex items-center justify-center rounded-input bg-surface px-6 py-[15px] text-[15px] font-bold text-text hover:bg-primary-light";
export const btnOnDark =
  "inline-flex items-center justify-center rounded-input border-[1.5px] border-landing-dark-outline px-6 py-[15px] text-[15px] font-bold text-white hover:border-white";
export const chip =
  "rounded-full border border-landing-outline bg-surface px-4 py-2.5 text-sm font-bold text-text hover:border-primary hover:text-primary-dark";
export const card = "rounded-card border border-border bg-surface";
export const cardHover =
  "transition-[border-color,box-shadow] duration-200 hover:border-primary hover:shadow-[0_12px_28px_-18px_rgba(10,31,84,0.35)]";
export const tintBand = "border-y border-border bg-landing-tint";
export const navyGradient =
  "bg-[linear-gradient(160deg,var(--color-text)_0%,var(--color-landing-navy-2)_100%)]";

/** Square brand marker before a list item (the export uses small coloured squares). */
export function Square({ className, size = "size-2" }: { className?: string; size?: string }) {
  return <span className={cn("shrink-0", size, className ?? "bg-primary")} aria-hidden="true" />;
}

/** Simple light hero used by most inner pages. */
export function PageHero({
  id = "hero-h",
  label,
  title,
  children,
  className,
}: {
  id?: string;
  label: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className="border-b border-border bg-landing-tint">
      <div className={cn(container, "flex flex-col gap-[22px] pt-20 pb-[88px]", className)}>
        <p className={eyebrow}>{label}</p>
        <h1 id={id} className={cn(h1, "max-w-[980px]")}>
          {title}
        </h1>
        {children}
      </div>
    </section>
  );
}

/** Closing call to action: navy-to-blue gradient card. */
export function CtaBand({
  title,
  href,
  action,
  children,
  className = "pb-24",
}: {
  title: string;
  href: string;
  action: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby="cta-h" className={cn(container, className)}>
      <div className="flex flex-wrap items-center justify-between gap-8 rounded-hero bg-[linear-gradient(120deg,var(--color-text)_0%,var(--color-landing-cta-mid)_70%,var(--color-primary)_100%)] px-[clamp(24px,5vw,64px)] py-16">
        <div className="flex max-w-[680px] flex-col gap-3">
          <h2
            id="cta-h"
            className="text-[clamp(26px,3vw,38px)] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance text-white"
          >
            {title}
          </h2>
          {children}
        </div>
        <Link
          href={href}
          className="rounded-input bg-surface px-7 py-4 text-base font-bold text-text hover:bg-primary-light"
        >
          {action}
        </Link>
      </div>
    </section>
  );
}
