import type { Metadata } from "next";
import Image from "next/image";
import { CtaBand, PageHero, Square, card, container, eyebrow, heroLead, lead, tintBand } from "@/components/marketing/ui";
import teamImage from "@/assets/landing/about-team-collaboration.webp";
import globalImage from "@/assets/landing/global-delivery-network.webp";

// T-261 (F-960, ADR-042): About from the design export (About.dc.html).
export const metadata: Metadata = {
  title: { absolute: "About LERNOVIQ | Enterprise Learning Expertise" },
  description:
    "LERNOVIQ is an emerging learning technology and digital education solutions brand, founded on leadership experience across enterprise learning, instructional design and technology.",
};

const APPROACH = [
  "Understand the business challenge and the learner context.",
  "Design learning journeys around clearly defined objectives.",
  "Develop fit-for-purpose content, technology and assessments.",
  "Validate quality, usability and instructional effectiveness.",
  "Deliver collaboratively and support continuous improvement.",
];

const AREAS = [
  "Enterprise learning programs",
  "LMS and assessment platforms",
  "International project coordination",
  "Large-scale curricula",
  "Learning content for diverse business needs",
];

export default function AboutPage() {
  return (
    <>
      <PageHero label="About LERNOVIQ" title="Built on Experience. Driven by Innovation. Designed for the Future of Learning.">
        <p className={`${heroLead} max-w-[720px]`}>
          LERNOVIQ is an emerging learning technology and digital education solutions brand established in
          2026. Its vision is to make organizational learning more intelligent, adaptable and effective
          through a connected approach to content, platforms and delivery.
        </p>
      </PageHero>

      <section aria-labelledby="story-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-center gap-x-[72px] gap-y-12">
          <div className="flex flex-col gap-5">
            <p className={eyebrow}>Our story</p>
            <h2 id="story-h" className="text-[clamp(26px,3vw,36px)] leading-[1.15] font-extrabold tracking-[-0.02em] text-balance">
              Solutions built around the organization, its learners and its goals.
            </h2>
            <p className={lead}>
              The brand is founded on more than 26 years of professional leadership experience across
              enterprise technology, learning programs, instructional design, digital content and complex
              project execution. That experience informs how we approach the full learning lifecycle:
              understanding needs, shaping curricula, collaborating with subject matter experts, developing
              courses, validating outcomes and supporting delivery.
            </p>
            <p className={lead}>
              Rather than fitting every client into the same model, we aim to build solutions around the
              organization, its learners and its operational goals. Through our technology partnership with
              Innogenx and the ongoing development of LERNOVIQ LMS, we are building an integrated approach
              that connects learning expertise with modern software capabilities.
            </p>
          </div>
          <Image
            src={teamImage}
            alt="Colleagues discussing a learning technology project around a meeting table"
            sizes="(min-width: 1024px) 560px, 100vw"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
        </div>
      </section>

      <section aria-label="Mission and vision" className={tintBand}>
        <div className={`${container} grid grid-cols-[repeat(auto-fit,minmax(min(100%,400px),1fr))] gap-5 py-[88px]`}>
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-10">
            <span className="flex gap-1" aria-hidden="true">
              <Square size="size-2.5" className="bg-primary" />
              <Square size="size-2.5" className="bg-landing-dot-cyan" />
            </span>
            <h2 className="text-2xl font-extrabold">Our mission</h2>
            <p className={lead}>
              To help organizations worldwide create meaningful, accessible and measurable learning
              experiences by combining expert-led learning design, custom digital content, adaptable
              technology and accountable delivery.
            </p>
          </div>
          <div className="flex flex-col gap-4 rounded-2xl bg-text p-10 text-white">
            <span className="flex gap-1" aria-hidden="true">
              <Square size="size-2.5" className="bg-landing-on-dark-accent" />
              <Square size="size-2.5" className="bg-landing-dot-green" />
            </span>
            <h2 className="text-2xl font-extrabold text-white">Our vision</h2>
            <p className="text-[17px] leading-[1.7] text-landing-on-dark text-pretty">
              To become a trusted global partner for intelligent learning solutions — making it simpler for
              organizations to develop people, strengthen capabilities and adapt to change.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="appr-h" className={`${container} py-24`}>
        <div className="mb-10 flex max-w-[640px] flex-col gap-3.5">
          <p className={eyebrow}>Our approach</p>
          <h2 id="appr-h" className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em]">
            Five commitments that shape every engagement.
          </h2>
        </div>
        <ol className="flex flex-col border-t border-border">
          {APPROACH.map((t, i) => (
            <li key={t} className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4 border-b border-border py-6">
              <span className="text-[15px] font-extrabold text-primary-dark">0{i + 1}</span>
              <span className="text-[clamp(17px,2vw,21px)] leading-[1.45] font-semibold">{t}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="exp-h" className={tintBand}>
        <div className={`${container} grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-x-[72px] gap-y-10 py-24`}>
          <div className="flex flex-col gap-5">
            <p className={eyebrow}>Leadership experience</p>
            <h2 id="exp-h" className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em]">
              The experience behind LERNOVIQ
            </h2>
            <p className={lead}>
              LERNOVIQ draws on its founder/leadership’s 26+ years of professional experience, including
              enterprise learning programs, LMS and assessment platforms, international project coordination,
              large-scale curricula and learning content developed for diverse business needs.
            </p>
            <p className={lead}>
              Previous professional assignments have involved organizations such as Wipro, Lenovo, IIBF and
              Citibank. These names describe prior professional project exposure; they are not presented as
              direct LERNOVIQ customers or endorsements.
            </p>
          </div>
          <div className="flex flex-col gap-3 self-center">
            {AREAS.map((x) => (
              <div key={x} className="flex items-center gap-3.5 rounded-xl border border-border bg-surface px-5 py-[18px] text-base font-semibold">
                <Square />
                {x}
              </div>
            ))}
            <p className="px-0.5 py-1 text-[13px] leading-[1.6] text-neutral-text">
              Experience areas relate to the founder/leadership background, not to projects completed by LERNOVIQ.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="tech-h" className={`${container} py-24`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),1fr))] gap-6">
          <div className={`${card} flex flex-col gap-4 rounded-2xl p-10`}>
            <p className={eyebrow}>Technology collaboration</p>
            <h2 id="tech-h" className="text-[26px] leading-[1.2] font-extrabold">Working with Innogenx</h2>
            <p className={lead}>
              LERNOVIQ collaborates with Innogenx as a technology development partner, bringing together
              learning-domain expertise and software development capabilities to support the evolution of our
              digital learning solutions.
            </p>
          </div>
          <div className={`${card} flex flex-col overflow-hidden rounded-2xl`}>
            <Image src={globalImage} alt="" sizes="(min-width: 1024px) 600px, 100vw" className="h-auto w-full px-6 pt-6" />
            <div className="flex flex-col gap-3 px-10 pt-6 pb-10">
              <p className={eyebrow}>Global outlook</p>
              <p className={lead}>
                We aim to serve clients worldwide, coordinating project delivery across regions and planning
                localization as required by each engagement.
              </p>
            </div>
          </div>
        </div>
      </section>

      <CtaBand title="Have a learning challenge? Let’s build the right solution together." href="/contact" action="Start a Conversation" />
    </>
  );
}
