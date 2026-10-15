import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Accordion } from "@/components/marketing/accordion";
import { LmsTabs, type LmsTab } from "@/components/marketing/lms-tabs";
import {
  CtaBand,
  Square,
  btnOnDark,
  btnWhite,
  container,
  eyebrow,
  lead,
  navyGradient,
  tintBand,
} from "@/components/marketing/ui";
import dashboardImage from "@/assets/landing/lms-dashboard-overview.webp";
import learnerPageImage from "@/assets/landing/lms-learner-course-page.webp";
import courseManagementImage from "@/assets/landing/lms-course-management.webp";
import assessmentImage from "@/assets/landing/lms-assessment-interface.webp";

// T-261 (F-960, ADR-042): LMS product page from the design export (LMS.dc.html).
export const metadata: Metadata = {
  title: { absolute: "LERNOVIQ LMS | Adaptable Learning Technology" },
  description:
    "LERNOVIQ LMS is being developed to support a connected digital learning experience, pairing learning-domain expertise with an adaptable technology foundation.",
};

const TABS: LmsTab[] = [
  {
    label: "Learner experience",
    title: "Learning pathways and learner experience",
    body: "Structuring learning experiences so learners can see where they are, what comes next and how far they have progressed.",
    points: [
      "Personal dashboard and continue-learning entry point",
      "Course library and recommended courses",
      "Visible progress during learning",
    ],
    image: learnerPageImage,
    alt: "Concept of a learner course page with video lesson, module list and course progress",
  },
  {
    label: "Course management",
    title: "Course and content management",
    body: "Managing content in one place: organizing courses, tracking status and preparing material for delivery.",
    points: [
      "Course list with status and format",
      "Categories and filtering",
      "Content onboarding during implementation",
    ],
    image: courseManagementImage,
    alt: "Concept of an administrative course management table with status badges",
  },
  {
    label: "Assessments",
    title: "Assessment and knowledge evaluation",
    body: "Supporting knowledge assessment aligned with each program’s objectives and validation needs.",
    points: [
      "Question-by-question assessment flow",
      "Progress and question navigation",
      "Assessment design delivered as a service",
    ],
    image: assessmentImage,
    alt: "Concept of a multiple-choice assessment with a question navigator",
  },
  {
    label: "Activity visibility",
    title: "Learning activity visibility",
    body: "Providing visibility into learning activity so teams can review participation and progress.",
    points: [
      "Progress summaries for learners",
      "Activity overview for administrators",
      "Reporting scope agreed per engagement",
    ],
    image: dashboardImage,
    alt: "Concept of a learner dashboard with progress summary and upcoming activities",
  },
];

const AUDIENCES = [
  { text: "Enterprises exploring an adaptable platform for employee learning.", dot: "bg-primary" },
  {
    text: "BFSI organizations evaluating structured curricula and assessment needs.",
    dot: "bg-text",
  },
  {
    text: "Government or institutional teams planning scalable digital training.",
    dot: "bg-landing-teal",
  },
  {
    text: "Training providers seeking a tailored learning delivery environment.",
    dot: "bg-landing-green",
  },
];

const FAQS = [
  {
    q: "Is LERNOVIQ LMS ready for a demo?",
    a: "Please contact us for the current product status, available walkthrough and feature confirmation. We will share only capabilities that can be demonstrated.",
  },
  {
    q: "Does LERNOVIQ offer both learning content and an LMS?",
    a: "Yes. Our model brings together learning consulting and digital content services with a developing LMS offering. Product features and implementation options are discussed against your requirements.",
  },
  {
    q: "Can LERNOVIQ help with assessments and certifications?",
    a: "We provide assessment and certification solution design as part of the proposed learning services portfolio. Platform-specific automation depends on confirmed LMS capabilities and agreed scope.",
  },
];

export default function LmsPage() {
  return (
    <>
      <section aria-labelledby="hero-h" className={`${navyGradient} text-white`}>
        <div className={`${container} flex flex-col items-center gap-[22px] pt-20 text-center`}>
          <span className="inline-flex items-center gap-2 rounded-full border border-landing-dark-outline px-3.5 py-[7px] text-[13px] font-bold text-landing-on-dark">
            <span className="size-2 rounded-full bg-landing-dot-green" aria-hidden="true" />
            Walkthrough on request
          </span>
          <h1
            id="hero-h"
            className="max-w-[900px] text-[clamp(34px,4.6vw,56px)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance text-white"
          >
            Learning Technology Designed Around Your Organization.
          </h1>
          <p className="max-w-[700px] text-lg leading-[1.65] text-pretty text-landing-on-dark">
            LERNOVIQ LMS is being developed to support a connected digital learning experience,
            pairing learning-domain expertise with an adaptable technology foundation.
          </p>
          <div className="mt-1 flex flex-wrap justify-center gap-3">
            <Link href="#preview" className={btnWhite}>
              Explore LERNOVIQ LMS
            </Link>
            <Link href="/contact?topic=demo" className={btnOnDark}>
              Request a Product Walkthrough
            </Link>
          </div>
          <div className="mt-10 w-full max-w-[1080px] overflow-hidden rounded-t-2xl border border-b-0 border-landing-dark-border bg-surface">
            <Image
              src={dashboardImage}
              alt="Concept of the LERNOVIQ LMS learner dashboard with progress, current course and course library"
              priority
              sizes="(min-width: 1080px) 1080px, 100vw"
              className="aspect-[16/8] w-full object-cover object-top-left"
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="phil-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-x-[72px] gap-y-8">
          <div className="flex flex-col gap-3.5">
            <p className={eyebrow}>Product philosophy</p>
            <h2
              id="phil-h"
              className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance"
            >
              An adaptable learning platform designed around organizational learning needs.
            </h2>
          </div>
          <p className={lead}>
            A good learning platform should enable the learning strategy — not dictate it. Our
            approach is to understand how an organization creates content, delivers training,
            engages learners and reviews results, then align platform implementation with those
            workflows.
          </p>
        </div>
      </section>

      <section id="preview" aria-labelledby="prev-h" className={`${tintBand} scroll-mt-4`}>
        <div className={`${container} py-24`}>
          <div className="mb-8 flex max-w-[720px] flex-col gap-3.5">
            <p className={eyebrow}>Where LERNOVIQ LMS is headed</p>
            <h2
              id="prev-h"
              className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em]"
            >
              The learning functions organizations commonly need.
            </h2>
            <p className={lead}>
              Specific capabilities, integrations, subscription tiers and availability are confirmed
              during product discovery and demonstration.
            </p>
          </div>
          <LmsTabs tabs={TABS} />
        </div>
      </section>

      <section aria-labelledby="tech-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] gap-x-[72px] gap-y-10">
          <div className="flex flex-col gap-[18px]">
            <p className={eyebrow}>Platform &amp; implementation approach</p>
            <h2
              id="tech-h"
              className="text-[clamp(26px,3vw,36px)] leading-[1.15] font-extrabold tracking-[-0.02em]"
            >
              Technology foundation
            </h2>
            <p className="text-base leading-[1.7] text-pretty text-landing-body">
              The documented deployment design uses a Next.js application, container-based
              deployment with Docker, Caddy-managed HTTPS and a GitHub Actions release workflow. It
              provides for a separate content origin to support multi-frame SCORM packages,
              scheduled reporting jobs, and Supabase authentication configuration.
            </p>
            <p className="rounded-input border border-border bg-landing-tint px-4 py-3.5 text-sm leading-[1.6] text-neutral-text">
              These are architectural provisions documented in the deployment guide, not
              independently verified end-user features.
            </p>
          </div>
          <div className="flex flex-col gap-[18px]">
            <p className={eyebrow}>Who it is for</p>
            <ul className="flex flex-col gap-2.5">
              {AUDIENCES.map((a) => (
                <li
                  key={a.text}
                  className="flex items-center gap-3.5 rounded-xl border border-border px-5 py-[18px] text-base leading-[1.45] font-semibold"
                >
                  <Square className={a.dot} />
                  {a.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-h" className={tintBand}>
        <div className="mx-auto max-w-[900px] px-6 py-[88px]">
          <h2
            id="faq-h"
            className="mb-7 text-[clamp(26px,3vw,34px)] font-extrabold tracking-[-0.02em]"
          >
            Product status and common questions
          </h2>
          <Accordion items={FAQS} initialOpen={[0]} single />
        </div>
      </section>

      <CtaBand
        title="See what LERNOVIQ LMS can do today."
        href="/contact?topic=demo"
        action="Request a Product Walkthrough"
        className="py-24"
      >
        <p className="text-[17px] leading-[1.6] text-landing-on-dark">
          We will share only capabilities that can be demonstrated.
        </p>
      </CtaBand>
    </>
  );
}
