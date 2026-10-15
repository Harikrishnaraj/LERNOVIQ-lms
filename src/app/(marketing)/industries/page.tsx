import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  CtaBand,
  chip,
  container,
  eyebrow,
  eyebrowOnDark,
  h2Sm,
  lead,
  tintBand,
} from "@/components/marketing/ui";
import bannerImage from "@/assets/landing/industries-global-learning-banner.webp";
import corporateImage from "@/assets/landing/industry-corporate-learning.webp";
import bfsiImage from "@/assets/landing/industry-bfsi-learning.webp";
import governmentImage from "@/assets/landing/industry-government-learning.webp";
import globalImage from "@/assets/landing/global-delivery-network.webp";

// T-261 (F-960, ADR-042): Industries from the design export (Industries.dc.html).
export const metadata: Metadata = {
  title: { absolute: "Enterprise, BFSI & Government Learning Solutions | LERNOVIQ" },
  description:
    "Learning solutions for corporate and enterprise L&D, banking, financial services and insurance, and government and public institutions.",
};

const CORP = [
  "Employee onboarding",
  "Workforce upskilling",
  "Sales enablement",
  "Policy training",
  "Leadership development",
  "Enterprise learning pathways",
];
const BFSI = [
  "Domain-specific learning",
  "Certification-oriented programs",
  "Role-based paths",
  "Assessment content",
  "Regulatory training content developed with qualified SMEs",
];
const GOV = [
  "Large-scale digital training",
  "Standardized curricula",
  "Localized learning",
  "Tender-led projects",
  "Public-sector platform requirements",
];

function Needs({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return (
    <>
      <span
        className={`pt-1.5 text-xs font-extrabold tracking-[0.14em] uppercase ${dark ? "text-white" : ""}`}
      >
        Typical needs
      </span>
      <ul className="flex flex-wrap gap-2">
        {items.map((x) => (
          <li
            key={x}
            className={
              dark
                ? "rounded-control border border-landing-dark-border bg-landing-navy-2 px-3 py-2 text-sm font-semibold text-white"
                : "rounded-control bg-primary-light px-3 py-2 text-sm font-semibold"
            }
          >
            {x}
          </li>
        ))}
      </ul>
    </>
  );
}

export default function IndustriesPage() {
  return (
    <>
      <section
        aria-labelledby="hero-h"
        className="relative isolate overflow-hidden border-b border-border"
      >
        <Image
          src={bannerImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-right"
        />
        <div className="absolute inset-0 -z-10 bg-surface/90 md:bg-transparent md:bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface)_36%,color-mix(in_srgb,var(--color-surface)_85%,transparent)_52%,transparent_70%)]" />
        <div className={`${container} pt-24 pb-[104px]`}>
          <div className="flex max-w-[600px] flex-col gap-[22px]">
            <p className={eyebrow}>Industries we serve</p>
            <h1
              id="hero-h"
              className="text-[clamp(34px,4.6vw,56px)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance"
            >
              Learning Solutions for Complex, Evolving Industries.
            </h1>
            <nav aria-label="Industries" className="mt-2 flex flex-wrap gap-2">
              <Link href="#corporate" className={chip}>
                Corporate &amp; Enterprise
              </Link>
              <Link href="#bfsi" className={chip}>
                BFSI
              </Link>
              <Link href="#government" className={chip}>
                Government &amp; Public
              </Link>
            </nav>
          </div>
        </div>
      </section>

      <section id="corporate" aria-labelledby="corp-h" className={`${container} scroll-mt-4 py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-10">
          <Image
            src={corporateImage}
            alt="Professionals collaborating around a laptop during a workplace training session"
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
          <div className="flex flex-col gap-[18px]">
            <p className={eyebrow}>01 · Enterprise L&amp;D</p>
            <h2 id="corp-h" className={h2Sm}>
              Corporate &amp; Enterprise Learning
            </h2>
            <p className={lead}>
              Equip teams with learning that matches organizational priorities. From onboarding and
              role-based capability building to content modernization and global training rollouts,
              our approach begins with the workforce and the business outcomes that matter.
            </p>
            <Needs items={CORP} />
          </div>
        </div>
      </section>

      <section id="bfsi" aria-labelledby="bfsi-h" className="scroll-mt-4 bg-text text-white">
        <div
          className={`${container} flex flex-wrap-reverse items-center gap-x-[72px] gap-y-10 py-24`}
        >
          <div className="flex min-w-0 flex-[1_1_440px] flex-col gap-[18px]">
            <p className={eyebrowOnDark}>02 · BFSI</p>
            <h2 id="bfsi-h" className={`${h2Sm} text-white`}>
              Banking, Financial Services &amp; Insurance
            </h2>
            <p className="text-[17px] leading-[1.7] text-pretty text-landing-on-dark">
              BFSI learning requires clarity, structure and precision. Our leadership background
              includes large certification-focused curricula and multi-level learning initiatives.
              We apply this experience to learning pathway design, professional training content,
              subject-matter collaboration and assessment planning.
            </p>
            <Needs items={BFSI} dark />
          </div>
          <Image
            src={bfsiImage}
            alt="Financial services professionals reviewing training material together"
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full min-w-0 flex-[1_1_440px] rounded-2xl object-cover"
          />
        </div>
      </section>

      <section id="government" aria-labelledby="gov-h" className={`${container} scroll-mt-4 py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-10">
          <Image
            src={governmentImage}
            alt="Institutional staff attending a structured training session"
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
          <div className="flex flex-col gap-[18px]">
            <p className={eyebrow}>03 · Public sector</p>
            <h2 id="gov-h" className={h2Sm}>
              Government &amp; Public Institutions
            </h2>
            <p className={lead}>
              Public-sector learning programs often involve diverse audiences, formal specifications
              and many stakeholders. We support requirements-led solutions across digital curriculum
              design, multilingual content, managed implementation and learning technology
              initiatives.
            </p>
            <Needs items={GOV} />
          </div>
        </div>
      </section>

      <section aria-labelledby="glob-h" className={tintBand}>
        <div className={`${container} flex flex-col items-center gap-[18px] py-24 text-center`}>
          <p className={eyebrow}>Global delivery approach</p>
          <h2
            id="glob-h"
            className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em]"
          >
            Learning challenges cross borders.
          </h2>
          <p className={`${lead} max-w-[760px]`}>
            We seek to work with organizations worldwide through remote collaboration, flexible
            project delivery and coordination with client teams and subject matter experts across
            time zones. Localization and market-specific requirements are planned as part of each
            engagement.
          </p>
          <Image
            src={globalImage}
            alt=""
            sizes="(min-width: 980px) 980px, 100vw"
            className="mt-6 h-auto w-full max-w-[980px]"
          />
        </div>
      </section>

      <CtaBand
        title="Every sector learns differently. Tell us about yours."
        href="/contact"
        action="Discuss Your Sector’s Learning Requirements"
        className="py-24"
      />
    </>
  );
}
