import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/contact-form";
import { container, eyebrow, h1, heroLead } from "@/components/marketing/ui";
import consultationImage from "@/assets/landing/contact-consultation-team.webp";

// T-264 (F-963, ADR-042): Contact from the design export (Contact.dc.html). The export's
// "Business contact details" placeholder is left out until verified details exist.
export const metadata: Metadata = {
  title: { absolute: "Contact LERNOVIQ | Discuss Your Learning Requirements" },
  description:
    "Tell us what you want to achieve. We’ll help explore a learning solution that fits your learners, systems and business objectives.",
};

const OTHER = [
  { label: "Explore Our Solutions →", href: "/solutions" },
  { label: "Explore LERNOVIQ LMS →", href: "/lms" },
  { label: "Read the FAQs →", href: "/faqs" },
];

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ topic?: string }>;
}) {
  const { topic } = await searchParams;

  return (
    <>
      <section aria-labelledby="hero-h" className="border-b border-border bg-landing-tint">
        <div className={`${container} flex flex-col gap-5 pt-[72px] pb-16`}>
          <p className={eyebrow}>Contact</p>
          <h1 id="hero-h" className={`${h1} max-w-[820px]`}>
            Let’s Build Better Learning Together.
          </h1>
          <p className={`${heroLead} max-w-[720px]`}>
            Planning a new training program, modernizing existing content or evaluating learning
            technology? Tell us what you want to achieve. We’ll help explore a solution that fits
            your learners, systems and business objectives.
          </p>
        </div>
      </section>

      <section className={`${container} flex flex-wrap items-start gap-x-14 gap-y-10 pt-16 pb-24`}>
        <div className="min-w-0 flex-[1_1_560px]">
          <ContactForm initialKind={topic === "demo" ? "demo" : "consultation"} />
        </div>
        <aside className="flex min-w-0 flex-[1_1_340px] flex-col gap-5">
          <Image
            src={consultationImage}
            alt="A learning technology consultant in conversation with enterprise clients"
            sizes="(min-width: 1024px) 420px, 100vw"
            className="aspect-[4/3] w-full rounded-2xl object-cover"
          />
          <div className="flex flex-col gap-3 rounded-card border border-border p-6">
            <h2 className="text-[17px] font-extrabold">Other ways to start</h2>
            {OTHER.map((o) => (
              <Link
                key={o.href}
                href={o.href}
                className="flex min-h-8 items-center text-[15px] font-semibold text-primary-dark hover:text-text"
              >
                {o.label}
              </Link>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
