import type { Metadata } from "next";
import { FaqBrowser, type FaqGroup } from "@/components/marketing/faq-browser";
import { CtaBand, eyebrow, heroLead } from "@/components/marketing/ui";

// T-261 (F-960, ADR-042): FAQs from the design export (FAQs.dc.html).
export const metadata: Metadata = {
  title: { absolute: "FAQs | LERNOVIQ Learning Solutions & LMS" },
  description: "Short answers about LERNOVIQ’s services, LERNOVIQ LMS and how engagements work.",
};

const GROUPS: FaqGroup[] = [
  {
    key: "general",
    label: "General",
    items: [
      {
        q: "Does LERNOVIQ offer both learning content and an LMS?",
        a: "Yes. Our model brings together learning consulting and digital content services with a developing LMS offering. Product features and implementation options are discussed against your requirements.",
      },
      {
        q: "What is LERNOVIQ?",
        a: "LERNOVIQ is an emerging learning technology and digital education solutions brand established in 2026, founded on more than 26 years of professional leadership experience across enterprise technology, learning programs, instructional design, digital content and complex project execution.",
      },
    ],
  },
  {
    key: "lms",
    label: "LERNOVIQ LMS",
    items: [
      {
        q: "Is LERNOVIQ LMS ready for a demo?",
        a: "Please contact us for the current product status, available walkthrough and feature confirmation. We will share only capabilities that can be demonstrated.",
      },
      {
        q: "What will LERNOVIQ LMS cover?",
        a: "Our product direction focuses on the learning functions organizations commonly need: managing content, structuring learning experiences, supporting knowledge assessment, providing visibility into learning activity and connecting learning operations. Specific capabilities, integrations, subscription tiers and availability are confirmed during product discovery and demonstration.",
      },
    ],
  },
  {
    key: "services",
    label: "Services",
    items: [
      {
        q: "Can you create courses tailored to our industry?",
        a: "Our approach starts with your business needs, target learners and subject matter experts to design a custom learning solution suited to your requirements.",
      },
      {
        q: "Can you work with our internal SMEs?",
        a: "Yes. SME collaboration is central to our process for content accuracy, appropriate learning depth and validation.",
      },
      {
        q: "Can LERNOVIQ help with assessments and certifications?",
        a: "We provide assessment and certification solution design as part of the proposed learning services portfolio. Platform-specific automation depends on confirmed LMS capabilities and agreed scope.",
      },
    ],
  },
  {
    key: "delivery",
    label: "Industries & delivery",
    items: [
      {
        q: "Do you support global organizations?",
        a: "We aim to serve clients worldwide, coordinating project delivery across regions and planning localization as required by each engagement.",
      },
      {
        q: "Which sectors do you work with?",
        a: "We support corporate and enterprise L&D, banking, financial services and insurance, and government and public institutions — with custom approaches for each sector’s workforce, compliance, skills and learning requirements.",
      },
      {
        q: "How does an engagement progress?",
        a: "Through six stages: Discover, Define, Design, Develop, Validate, and Deliver & Support. Scope, deliverables, governance and review criteria are agreed early in the engagement.",
      },
    ],
  },
  {
    key: "start",
    label: "Getting started",
    items: [
      {
        q: "How do we start?",
        a: "Tell us what you want to achieve through the contact form. We’ll help explore a solution that fits your learners, systems and business objectives.",
      },
      {
        q: "What should we prepare for a first conversation?",
        a: "It helps to share your business goals, target learners, existing content, technology context, timelines and constraints. These are the inputs to our Discover stage.",
      },
    ],
  },
];

export default function FaqsPage() {
  return (
    <>
      <section aria-labelledby="hero-h" className="border-b border-border bg-landing-tint">
        <div className="mx-auto flex max-w-[960px] flex-col gap-5 px-6 pt-[72px] pb-16">
          <p className={eyebrow}>FAQs</p>
          <h1 id="hero-h" className="text-[clamp(34px,4.6vw,52px)] leading-[1.08] font-extrabold tracking-[-0.025em] text-balance">
            Questions, answered clearly.
          </h1>
          <p className={`${heroLead} max-w-[680px]`}>
            Short answers about our services, LERNOVIQ LMS and how engagements work. If something is not
            covered here, ask us directly.
          </p>
        </div>
      </section>

      <section aria-label="Frequently asked questions" className="mx-auto max-w-[960px] px-6 pt-14 pb-24">
        <FaqBrowser groups={GROUPS} />
      </section>

      <CtaBand title="Still have a question? We’re happy to help." href="/contact" action="Start a Conversation" />
    </>
  );
}
