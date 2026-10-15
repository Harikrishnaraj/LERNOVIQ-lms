import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import {
  CtaBand,
  PageHero,
  btnOutlineSm,
  chip,
  container,
  eyebrow,
  heroLead,
  lead,
  tintBand,
} from "@/components/marketing/ui";
import { cn } from "@/lib/utils/cn";
import consultingImage from "@/assets/landing/service-learning-consulting.webp";
import elearningImage from "@/assets/landing/service-elearning-development.webp";
import lmsImage from "@/assets/landing/service-lms-technology.webp";
import assessmentImage from "@/assets/landing/lms-assessment-interface.webp";
import localizationImage from "@/assets/landing/service-localization-video.webp";
import managedImage from "@/assets/landing/service-managed-learning.webp";
import needsIcon from "@/assets/landing/journey-learning-needs.webp";
import curriculumIcon from "@/assets/landing/journey-curriculum-planning.webp";
import contentIcon from "@/assets/landing/journey-content-development.webp";
import platformIcon from "@/assets/landing/journey-platform-delivery.webp";
import supportIcon from "@/assets/landing/journey-ongoing-support.webp";

// T-261 (F-960, ADR-042): Solutions from the design export (Solutions.dc.html).
export const metadata: Metadata = {
  title: { absolute: "E-Learning Development & Learning Consulting | LERNOVIQ" },
  description:
    "Learning consulting, custom e-learning, LMS technology, assessments, localization and managed learning services from LERNOVIQ.",
};

const SERVICES: {
  id: string;
  short: string;
  title: string;
  body: string;
  scope: string[];
  image: StaticImageData;
  alt: string;
  concept?: boolean;
  cta: string;
  href: string;
}[] = [
  {
    id: "consulting",
    short: "Learning Consulting",
    title: "Learning Consulting & Curriculum Architecture",
    body: "Plan learning before producing it. We work with stakeholders and subject matter experts to identify business needs, learner profiles, skill expectations and the appropriate depth of learning.",
    scope: [
      "Training needs analysis",
      "Competency and skill mapping",
      "Role-based learning paths",
      "Curriculum architecture",
      "Course outlines and storyboards",
      "Subject matter expert coordination",
    ],
    image: consultingImage,
    alt: "Learning consultants and subject matter experts reviewing a curriculum roadmap at a table",
    cta: "Discuss a Curriculum Project",
    href: "/contact",
  },
  {
    id: "elearning",
    short: "Custom E-Learning",
    title: "Custom E-Learning & Instructional Design",
    body: "Create effective learning experiences grounded in instructional design principles and adult learning considerations. We develop content around clear objectives, meaningful examples and checkpoints that help learners apply knowledge.",
    scope: [
      "Custom e-learning modules",
      "Interactive and scenario-based learning",
      "Content conversion and modernization",
      "Instructional storyboards",
      "Knowledge checks",
      "SCORM-oriented course production where agreed",
    ],
    image: elearningImage,
    alt: "Instructional designers building course storyboards and video content on large monitors",
    cta: "Plan an E-Learning Project",
    href: "/contact",
  },
  {
    id: "lms",
    short: "LMS & Technology",
    title: "LERNOVIQ LMS & Learning Technology",
    body: "Bring learning delivery and management into a cohesive technology environment. Our product approach emphasizes configurable experiences, effective content delivery and practical learning operations.",
    scope: [
      "LMS discovery and solution fit",
      "Implementation planning",
      "Content onboarding",
      "Product configuration and integrations subject to scope",
      "Platform support options",
    ],
    image: lmsImage,
    alt: "A laptop showing a learning platform dashboard on a desk",
    cta: "Explore LERNOVIQ LMS",
    href: "/lms",
  },
  {
    id: "assessments",
    short: "Assessments",
    title: "Assessments & Certification Solutions",
    body: "Build confidence in what learners know. We help define assessment approaches suited to content complexity, learner proficiency and the validation needs of each training program.",
    scope: [
      "Quizzes and knowledge checkpoints",
      "Question-bank planning",
      "Assessment design",
      "Evaluation workflows",
      "Certificate design and certification processes",
    ],
    image: assessmentImage,
    alt: "Concept of a multiple-choice assessment screen with a question navigator",
    concept: true,
    cta: "Discuss Assessment Needs",
    href: "/contact",
  },
  {
    id: "localization",
    short: "Localization & Video",
    title: "Learning Localization & Video Solutions",
    body: "Make digital learning relevant to diverse workforces. We support the adaptation of learning experiences for different language and cultural contexts, as well as video-rich training formats.",
    scope: [
      "Localization planning",
      "Translation and language adaptation",
      "Subtitling and voice-over coordination",
      "Video learning",
      "Multimedia adaptation and review",
    ],
    image: localizationImage,
    alt: "A producer editing a training video with subtitle and audio tracks",
    cta: "Discuss Localization",
    href: "/contact",
  },
  {
    id: "managed",
    short: "Managed Learning",
    title: "Managed Learning Services & Delivery",
    body: "Move large learning initiatives forward with disciplined coordination across clients, vendors, SMEs, developers and review teams. We support implementation from requirements through release and post-delivery activities.",
    scope: [
      "Project planning",
      "RFP response and solutioning support",
      "Stakeholder governance",
      "Content QA",
      "Milestone management",
      "Testing and acceptance coordination",
      "Post-delivery support arrangements",
    ],
    image: managedImage,
    alt: "A learning operations team reviewing a project timeline on a laptop",
    cta: "Discuss a Delivery Program",
    href: "/contact",
  },
];

const JOURNEY: { title: string; sub: string; icon: StaticImageData; badge: string }[] = [
  {
    title: "Learning Needs",
    sub: "Consulting & needs analysis",
    icon: needsIcon,
    badge: "bg-primary",
  },
  {
    title: "Curriculum Planning",
    sub: "Curriculum architecture",
    icon: curriculumIcon,
    badge: "bg-landing-teal",
  },
  {
    title: "Digital Content Development",
    sub: "E-learning, assessments, localization",
    icon: contentIcon,
    badge: "bg-primary",
  },
  {
    title: "Learning Platform Delivery",
    sub: "LERNOVIQ LMS & technology",
    icon: platformIcon,
    badge: "bg-landing-green",
  },
  {
    title: "Ongoing Support",
    sub: "Managed learning services",
    icon: supportIcon,
    badge: "bg-text",
  },
];

export default function SolutionsPage() {
  return (
    <>
      <PageHero
        label="Solutions & Services"
        title="Solutions That Fit Your Learning Goals."
        className="pb-14"
      >
        <p className={`${heroLead} max-w-[720px]`}>
          Whether you are building a new curriculum, modernizing training content, rolling out
          digital learning or exploring a learning platform, we work from your requirements to
          develop the right approach.
        </p>
        <nav aria-label="Service areas" className="mt-4 flex flex-wrap gap-2">
          {SERVICES.map((s) => (
            <Link key={s.id} href={`#${s.id}`} className={chip}>
              {s.short}
            </Link>
          ))}
        </nav>
      </PageHero>

      <div className={`${container} flex flex-col pt-10 pb-6`}>
        {SERVICES.map((s, i) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-h`}
            className={cn(
              "flex scroll-mt-6 flex-wrap items-center gap-x-[72px] gap-y-10 border-b border-border py-14",
              i % 2 ? "flex-row-reverse" : "flex-row",
            )}
          >
            <div className="min-w-0 flex-[1_1_420px]">
              {s.concept ? (
                <figure className="m-0 flex flex-col gap-3 rounded-2xl bg-primary-light p-6">
                  <Image
                    src={s.image}
                    alt={s.alt}
                    sizes="(min-width: 1024px) 560px, 100vw"
                    className="aspect-[16/10] w-full rounded-input object-cover object-top-left shadow-[0_20px_40px_-24px_rgba(10,31,84,0.45)]"
                  />
                  <figcaption className="text-[13px] text-landing-body">
                    Interface concept.
                  </figcaption>
                </figure>
              ) : (
                <Image
                  src={s.image}
                  alt={s.alt}
                  sizes="(min-width: 1024px) 560px, 100vw"
                  className="aspect-[4/3] w-full rounded-2xl border border-border object-cover"
                />
              )}
            </div>
            <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-[18px]">
              <span className="text-[13px] font-extrabold tracking-[0.08em] text-primary-dark">
                0{i + 1}
              </span>
              <h2
                id={`${s.id}-h`}
                className="text-[clamp(24px,2.8vw,34px)] leading-[1.15] font-extrabold tracking-[-0.015em] text-balance"
              >
                {s.title}
              </h2>
              <p className={lead}>{s.body}</p>
              <div className="flex flex-col gap-3 pt-2">
                <span className="text-xs font-extrabold tracking-[0.14em] uppercase">
                  Typical scope
                </span>
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-x-5 gap-y-2">
                  {s.scope.map((x) => (
                    <li
                      key={x}
                      className="flex items-baseline gap-2.5 text-[15px] leading-[1.5] text-landing-body"
                    >
                      <span
                        className="size-1.5 shrink-0 -translate-y-0.5 bg-primary"
                        aria-hidden="true"
                      />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <Link href={s.href} className={`${btnOutlineSm} mt-2`}>
                {s.cta}
              </Link>
            </div>
          </section>
        ))}
      </div>

      <section aria-labelledby="tog-h" className={`${tintBand} mt-[72px]`}>
        <div className={`${container} py-24`}>
          <div className="mb-11 flex max-w-[680px] flex-col gap-3.5">
            <p className={eyebrow}>How services work together</p>
            <h2
              id="tog-h"
              className="text-[clamp(28px,3.4vw,40px)] leading-[1.12] font-extrabold tracking-[-0.02em] text-balance"
            >
              From Learning Strategy to Learner Success.
            </h2>
            <p className={lead}>
              Engage one service or connect several. Each stage hands off cleanly to the next.
            </p>
          </div>
          <ol className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-3">
            {JOURNEY.map((j, i) => (
              <li
                key={j.title}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6"
              >
                <span className="flex items-center justify-between gap-2">
                  <Image
                    src={j.icon}
                    alt=""
                    width={64}
                    height={64}
                    className="size-16 rounded-full"
                  />
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-extrabold text-white",
                      j.badge,
                    )}
                  >
                    {i + 1}
                  </span>
                </span>
                <span className="text-[17px] leading-[1.3] font-bold">{j.title}</span>
                <span className="text-sm leading-[1.5] text-neutral-text">{j.sub}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <CtaBand
        title="Tell Us What You Need — We’ll Recommend a Learning Approach."
        href="/contact"
        action="Request a Consultation"
        className="py-24"
      />
    </>
  );
}
