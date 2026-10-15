import type { Metadata } from "next";
import Image from "next/image";
import { DeliveryStepper } from "@/components/marketing/delivery-stepper";
import {
  CtaBand,
  PageHero,
  Square,
  container,
  eyebrow,
  h2Sm,
  heroLead,
  lead,
  tintBand,
} from "@/components/marketing/ui";
import collaborationImage from "@/assets/landing/service-learning-consulting.webp";

// T-261 (F-960, ADR-042): Delivery approach from the design export (Delivery.dc.html).
export const metadata: Metadata = {
  title: { absolute: "Delivery Approach | LERNOVIQ" },
  description:
    "Six stages from requirement to results: Discover, Define, Design, Develop, Validate, and Deliver & Support.",
};

const PILLARS = [
  {
    title: "Quality and validation",
    body: "We review instructional integrity, content accuracy, usability and agreed technical acceptance criteria, with quality checks at every milestone.",
    dot: "bg-primary",
  },
  {
    title: "Communication and governance",
    body: "Scope, deliverables, governance and review criteria are agreed up front, followed by clear communication throughout the engagement.",
    dot: "bg-text",
  },
  {
    title: "Post-delivery support",
    body: "We orient stakeholder teams on handover and provide scoped post-delivery support, with defined expectations for timelines, acceptance and support.",
    dot: "bg-landing-green",
  },
];

export default function DeliveryPage() {
  return (
    <>
      <PageHero label="How we work" title="A Structured Journey from Requirement to Results.">
        <p className={`${heroLead} max-w-[700px]`}>
          Clear communication. Fit-for-purpose learning design. Collaborative delivery. Quality at
          every milestone. Defined expectations for timelines, acceptance and support.
        </p>
      </PageHero>

      <section aria-labelledby="steps-h" className={`${container} py-24`}>
        <h2
          id="steps-h"
          className="mb-9 text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em]"
        >
          Six stages, one accountable process.
        </h2>
        <DeliveryStepper />
      </section>

      <section aria-labelledby="collab-h" className={tintBand}>
        <div
          className={`${container} grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-10 py-24`}
        >
          <Image
            src={collaborationImage}
            alt="Project team and client representatives reviewing a learning roadmap in a discovery workshop"
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
          <div className="flex flex-col gap-[18px]">
            <p className={eyebrow}>Client collaboration</p>
            <h2 id="collab-h" className={h2Sm}>
              Built with your teams and subject matter experts.
            </h2>
            <p className={lead}>
              SME collaboration is central to our process for content accuracy, appropriate learning
              depth and validation. We coordinate with client teams and subject matter experts
              across time zones.
            </p>
          </div>
        </div>
      </section>

      <section aria-label="Quality, governance and support" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="flex flex-col gap-3.5 rounded-card border border-border p-8"
            >
              <Square size="size-2.5" className={p.dot} />
              <h2 className="text-[21px] leading-[1.25] font-extrabold">{p.title}</h2>
              <p className="text-base leading-[1.7] text-pretty text-landing-body">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <CtaBand
        title="Start with discovery. We’ll map the right path from there."
        href="/contact"
        action="Request a Consultation"
      />
    </>
  );
}
