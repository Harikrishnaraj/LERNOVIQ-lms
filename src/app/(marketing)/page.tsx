import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { AddToCartButton } from "@/components/marketing/add-to-cart-button";
import {
  CtaBand,
  Square,
  btnOnDark,
  btnOutline,
  btnOutlineSm,
  btnPrimary,
  btnWhite,
  card,
  cardHover,
  container,
  eyebrow,
  eyebrowOnDark,
  h2,
  lead,
  navyGradient,
  textLink,
  tintBand,
} from "@/components/marketing/ui";
import { getPortalPathForUser } from "@/features/auth/roles";
import { LEVEL_OPTIONS, parseCatalogFilters } from "@/features/catalog/filters";
import { searchCourses, type CourseCardData } from "@/features/catalog/search-courses";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatPrice } from "@/lib/utils/format";
import heroImage from "@/assets/landing/home-hero-learning-platform.webp";
import teamImage from "@/assets/landing/about-team-collaboration.webp";
import dashboardImage from "@/assets/landing/lms-dashboard-overview.webp";
import learnerPageImage from "@/assets/landing/lms-learner-course-page.webp";
import elearningImage from "@/assets/landing/service-elearning-development.webp";
import corporateImage from "@/assets/landing/industry-corporate-learning.webp";
import bfsiImage from "@/assets/landing/industry-bfsi-learning.webp";
import governmentImage from "@/assets/landing/industry-government-learning.webp";
import globalImage from "@/assets/landing/global-delivery-network.webp";
import { DELIVERY_STAGES } from "@/components/marketing/delivery-stages";

// T-260 (F-960, ADR-042): Home from the design export (Home.dc.html). Featured courses come from
// the live catalogue, not the export's sample data (ADR-023).
export const metadata: Metadata = {
  title: { absolute: "Smarter Learning & Custom E-Learning Solutions | LERNOVIQ" },
  description:
    "Explore LERNOVIQ’s custom e-learning, curriculum design, assessments, localization and LMS technology approach for organizations worldwide.",
};

// Icon paths are the export's own 24×24 strokes.
const SERVICES = [
  {
    title: "Learning Consulting & Curriculum Design",
    body: "Translate business objectives into learning strategies, role-based curricula and structured development pathways.",
    href: "/solutions#consulting",
    icon: "M9 4h6M4 8h16v12H4zM8 12h8M8 16h5",
  },
  {
    title: "Custom E-Learning Development",
    body: "Create interactive, accessible and instructionally sound digital training tailored to your audience.",
    href: "/solutions#elearning",
    icon: "M3 5h18v11H3zM8 20h8M12 16v4M10 8.5v4l3.5-2z",
  },
  {
    title: "LERNOVIQ LMS & Learning Technology",
    body: "Bring course delivery and learning operations into a modern, adaptable platform ecosystem.",
    href: "/solutions#lms",
    icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  },
  {
    title: "Assessments & Certification Solutions",
    body: "Design knowledge checks, evaluations and certification experiences aligned with learning objectives.",
    href: "/solutions#assessments",
    icon: "M10 6h10M10 12h10M10 18h10M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17",
  },
  {
    title: "Localization & Video Learning",
    body: "Adapt learning content for diverse audiences through multilingual and multimedia experiences.",
    href: "/solutions#localization",
    icon: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18",
  },
  {
    title: "Managed Learning Services",
    body: "Coordinate complex delivery programs with structured project management, quality reviews and support.",
    href: "/solutions#managed",
    icon: "M4 6h16M4 12h9M4 18h6M15 16l2.5 2.5L22 14",
  },
];

const PILLARS = [
  { label: "Strategy", dot: "bg-primary" },
  { label: "Content", dot: "bg-landing-dot-cyan" },
  { label: "Technology", dot: "bg-text" },
  { label: "Delivery", dot: "bg-landing-dot-green" },
];

/** Shown on a featured course that has no thumbnail of its own, in the export's order. */
const COURSE_FALLBACK_IMAGES = [bfsiImage, learnerPageImage, teamImage, elearningImage];

const INDUSTRIES: { title: string; href: string; image: StaticImageData; alt: string }[] = [
  {
    title: "Corporate & Enterprise Learning",
    href: "/industries#corporate",
    image: corporateImage,
    alt: "Professionals collaborating around a laptop during a workplace training session",
  },
  {
    title: "Banking, Financial Services & Insurance",
    href: "/industries#bfsi",
    image: bfsiImage,
    alt: "Financial services professionals reviewing training material together",
  },
  {
    title: "Government & Public Institutions",
    href: "/industries#government",
    image: governmentImage,
    alt: "Institutional staff attending a structured training session",
  },
];

async function loadFeaturedCourses(): Promise<CourseCardData[] | null> {
  try {
    const supabase = await createClient();
    const { courses } = await searchCourses(supabase, parseCatalogFilters({ sort: "top_rated" }));
    return courses.slice(0, 4);
  } catch {
    return null; // the section shows a fallback; the rest of the page still renders
  }
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(await getPortalPathForUser(supabase, user.id));

  const featured = await loadFeaturedCourses();

  return (
    <>
      <section
        aria-labelledby="hero-h"
        className="relative isolate overflow-hidden border-b border-border"
      >
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-right"
        />
        {/* Export: white up to 46%, fading out by 80%. Below md the text spans the image, so it gets a wash. */}
        <div className="absolute inset-0 -z-10 bg-surface/90 md:bg-transparent md:bg-[linear-gradient(90deg,var(--color-surface)_0%,var(--color-surface)_46%,color-mix(in_srgb,var(--color-surface)_90%,transparent)_60%,transparent_80%)]" />
        <div className={`${container} flex pt-24 pb-[104px]`}>
          <div className="flex max-w-[520px] flex-col gap-6">
            <p className={`${eyebrow} leading-[1.6]`}>
              Learning Solutions • LMS Technology • Global Delivery
            </p>
            <h1
              id="hero-h"
              className="text-[clamp(38px,5vw,60px)] leading-[1.06] font-extrabold tracking-[-0.025em] text-balance"
            >
              Smarter Learning. Stronger Outcomes.
            </h1>
            <p className="max-w-[540px] text-lg leading-[1.65] text-pretty text-landing-body">
              From learning strategy and custom e-learning to LMS technology and managed delivery,
              LERNOVIQ brings every stage of the learning journey together in one integrated
              approach.
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <Link href="/contact" className={btnPrimary}>
                Discuss Your Learning Needs
              </Link>
              <Link href="/solutions" className={btnOutline}>
                Explore Our Solutions
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="intro-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-x-[72px] gap-y-8">
          <div className="flex flex-col gap-3.5">
            <p className={eyebrow}>Who we are</p>
            <h2 id="intro-h" className={h2}>
              One Partner. Complete Learning Solutions.
            </h2>
          </div>
          <div className={`flex flex-col gap-4 ${lead}`}>
            <p>
              Every organization has distinct learning goals. We help turn them into thoughtful,
              engaging and practical learning experiences.
            </p>
            <p>
              LERNOVIQ combines enterprise learning expertise, instructional design, bespoke content
              development and modern learning technology to support organizations from their first
              requirement through implementation and ongoing improvement.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="svc-h" className={tintBand}>
        <div className={`${container} py-24`}>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[620px] flex-col gap-3.5">
              <p className={eyebrow}>Solutions</p>
              <h2 id="svc-h" className={h2}>
                Six solution areas, one connected approach.
              </h2>
            </div>
            <Link href="/solutions" className={textLink}>
              View all solutions →
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-5">
            {SERVICES.map((s) => (
              <Link
                key={s.title}
                href={s.href}
                className={`${card} ${cardHover} flex flex-col gap-4 p-7 text-text`}
              >
                <span className="flex size-11 items-center justify-center rounded-input bg-primary-light text-primary">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={s.icon} />
                  </svg>
                </span>
                <h3 className="text-[19px] leading-[1.3] font-bold">{s.title}</h3>
                <p className="text-[15px] leading-[1.6] text-pretty text-neutral-text">{s.body}</p>
                <span className="mt-auto text-sm font-bold text-primary-dark">Learn more →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="why-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-12">
          <Image
            src={teamImage}
            alt="Colleagues discussing a learning technology project around a meeting table"
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
          <div className="flex flex-col gap-5">
            <p className={eyebrow}>Why LERNOVIQ</p>
            <h2 id="why-h" className={h2}>
              Learning First. Technology That Supports It.
            </h2>
            <p className={lead}>
              We start with your goals, not a pre-set template. By uniting strategy, content,
              technology and delivery, we help reduce complexity and build learning experiences
              designed for real-world use.
            </p>
            <div className="my-1 grid grid-cols-2 gap-2.5">
              {PILLARS.map((p) => (
                <div
                  key={p.label}
                  className="flex items-center gap-2.5 rounded-input border border-border px-4 py-3.5 text-[15px] font-bold"
                >
                  <Square className={p.dot} />
                  {p.label}
                </div>
              ))}
            </div>
            <Link href="/about" className={btnOutlineSm}>
              Discover Why LERNOVIQ
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="lms-h" className={`${navyGradient} text-white`}>
        <div
          className={`${container} grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] items-center gap-x-16 gap-y-12 py-24`}
        >
          <div className="flex max-w-[520px] flex-col gap-5">
            <p className={eyebrowOnDark}>LERNOVIQ LMS</p>
            <h2 id="lms-h" className={`${h2} text-white`}>
              An adaptable learning platform designed around organizational learning needs.
            </h2>
            <p className="text-[17px] leading-[1.7] text-pretty text-landing-on-dark">
              A good learning platform should enable the learning strategy, not dictate it.
              LERNOVIQ LMS is being developed to support a connected digital learning experience.
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <Link href="/lms" className={btnWhite}>
                Explore LERNOVIQ LMS
              </Link>
              <Link href="/contact?topic=demo" className={btnOnDark}>
                Request a Product Walkthrough
              </Link>
            </div>
          </div>
          <figure className="m-0 flex flex-col gap-3">
            <div className="overflow-hidden rounded-card border border-landing-dark-border bg-surface shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]">
              <Image
                src={dashboardImage}
                alt="Concept of the LERNOVIQ LMS learner dashboard with course library and progress overview"
                sizes="(min-width: 1024px) 560px, 100vw"
                className="aspect-[16/10] w-full object-cover object-top-left"
              />
            </div>
            <figcaption className="text-[13px] text-landing-on-dark-caption">
              Product design concept. Features shown are subject to confirmation during product
              discovery.
            </figcaption>
          </figure>
        </div>
      </section>

      <section aria-labelledby="crs-h" className={`${container} pt-24`}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div className="flex max-w-[640px] flex-col gap-3.5">
            <p className={eyebrow}>Featured courses</p>
            <h2 id="crs-h" className={h2}>
              Start learning today.
            </h2>
            <p className="text-base leading-[1.6] text-neutral-text">
              For yourself or for your whole team.
            </p>
          </div>
          <Link href="/courses" className={textLink}>
            Browse all courses →
          </Link>
        </div>
        <FeaturedCourses courses={featured} />
      </section>

      <section aria-labelledby="ind-h" className={`${container} py-24`}>
        <div className="mb-10 flex max-w-[720px] flex-col gap-3.5">
          <p className={eyebrow}>Industries</p>
          <h2 id="ind-h" className={h2}>
            Designed for organizations worldwide.
          </h2>
          <p className={lead}>
            Supporting corporate and enterprise L&amp;D, banking and financial services, and
            government and public institutions, with custom approaches for each sector’s workforce,
            compliance, skills and learning requirements.
          </p>
        </div>
        {/* First industry is featured; the other two stack beside it (md+). */}
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          {INDUSTRIES.map((i, n) => (
            <Link
              key={i.title}
              href={i.href}
              className={`${card} flex flex-col overflow-hidden text-text hover:border-primary ${n === 0 ? "md:row-span-2" : ""}`}
            >
              <Image
                src={i.image}
                alt={i.alt}
                sizes={n === 0 ? "(min-width: 768px) 700px, 100vw" : "(min-width: 768px) 500px, 100vw"}
                className={`w-full object-cover ${n === 0 ? "aspect-[4/3] min-h-0 md:flex-1" : "aspect-video"}`}
              />
              <div className="flex items-center justify-between gap-3 px-6 pt-[22px] pb-[26px]">
                <h3 className="text-lg leading-[1.3] font-bold">{i.title}</h3>
                <span aria-hidden="true" className="font-bold text-primary-dark">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="del-h" className={tintBand}>
        <div className={`${container} py-24`}>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div className="flex max-w-[640px] flex-col gap-3.5">
              <p className={eyebrow}>Delivery approach</p>
              <h2 id="del-h" className={h2}>
                A Structured Journey from Requirement to Results.
              </h2>
            </div>
            <Link href="/delivery" className={textLink}>
              How we work →
            </Link>
          </div>
          {/* One continuous row of stages (the <ol> carries the order; no step numbers). */}
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,170px),1fr))] gap-3 min-[768px]:grid-cols-3 min-[1100px]:grid-cols-6">
            {DELIVERY_STAGES.map((s) => (
              <li key={s.title} className={`${card} flex flex-col gap-4 px-[22px] py-6`}>
                <Image
                  src={s.icon}
                  alt=""
                  width={64}
                  height={64}
                  className="size-16 rounded-full"
                />
                <span className="text-[17px] leading-[1.3] font-bold">{s.title}</span>
                <span className="text-sm leading-[1.55] text-neutral-text">{s.short}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="glob-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] items-center gap-x-16 gap-y-10">
          <div className="flex max-w-[480px] flex-col gap-[18px]">
            <p className={eyebrow}>Global delivery</p>
            <h2
              id="glob-h"
              className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em]"
            >
              Learning challenges cross borders.
            </h2>
            <p className={lead}>
              We seek to work with organizations worldwide through remote collaboration, flexible
              project delivery and coordination with client teams and subject matter experts across
              time zones. Localization and market-specific requirements are planned as part of each
              engagement.
            </p>
          </div>
          <Image
            src={globalImage}
            alt=""
            sizes="(min-width: 1024px) 560px, 100vw"
            className="h-auto w-full"
          />
        </div>
      </section>

      <CtaBand
        title="Have a learning challenge? Let’s build the right solution together."
        href="/contact"
        action="Start a Conversation"
      />
    </>
  );
}

function FeaturedCourses({ courses }: { courses: CourseCardData[] | null }) {
  if (courses === null) {
    return (
      <p
        role="status"
        className="rounded-card border border-border bg-landing-tint p-6 text-neutral-text"
      >
        Featured courses could not be loaded right now.{" "}
        <Link href="/courses" className="font-semibold text-primary-dark underline">
          Browse the catalogue
        </Link>
        .
      </p>
    );
  }
  if (courses.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="New courses are on the way"
        description="Check back soon, or create an account to be notified."
      />
    );
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-[18px]">
      {courses.map((c, n) => {
        const level = LEVEL_OPTIONS.find((l) => l.value === c.level)?.label ?? c.level;
        return (
          <li key={c.id} className={`${card} flex flex-col overflow-hidden`}>
            {c.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, remote storage host
              <img
                src={c.thumbnailUrl}
                alt=""
                loading="lazy"
                className="aspect-video w-full bg-primary-light object-cover"
              />
            ) : (
              <Image
                src={COURSE_FALLBACK_IMAGES[n % COURSE_FALLBACK_IMAGES.length]}
                alt=""
                sizes="300px"
                className="aspect-video w-full bg-primary-light object-cover"
              />
            )}
            <div className="flex flex-1 flex-col gap-2 p-[18px]">
              {c.categoryName && (
                <span className="text-xs font-bold text-neutral-text">{c.categoryName}</span>
              )}
              <h3 className="text-[17px] leading-[1.35] font-bold">
                <Link href={`/courses/${c.slug}`} className="hover:text-primary-dark">
                  {c.title}
                </Link>
              </h3>
              <span className="text-[13px] text-neutral-text">
                {formatDuration(c.durationMinutes)} · {level}
              </span>
              <div className="mt-auto flex items-center justify-between gap-2.5 border-t border-border-subtle pt-3">
                <span className="text-lg font-extrabold">
                  {formatPrice(c.priceCents, c.currency)}
                </span>
                <AddToCartButton
                  course={{
                    courseId: c.id,
                    slug: c.slug,
                    title: c.title,
                    category: c.categoryName,
                    durationMinutes: c.durationMinutes,
                    priceCents: c.priceCents,
                    currency: c.currency,
                    thumbnailUrl: c.thumbnailUrl,
                  }}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
