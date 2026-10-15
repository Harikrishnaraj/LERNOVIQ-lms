import Link from "next/link";
import { BrandLogo } from "@/components/brand/brand-logo";

// Site footer from the design export (SiteFooter.dc.html, ADR-042). The export's
// "Privacy policy · Terms: TO_CONFIRM" placeholder is replaced by the existing privacy page.
const COLUMNS = [
  {
    heading: "Company",
    links: [
      { label: "About Us", href: "/about" },
      { label: "Delivery Approach", href: "/delivery" },
      { label: "FAQs", href: "/faqs" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Learning Consulting", href: "/solutions#consulting" },
      { label: "Custom E-Learning", href: "/solutions#elearning" },
      { label: "Assessments", href: "/solutions#assessments" },
      { label: "Localization & Video", href: "/solutions#localization" },
      { label: "Managed Learning", href: "/solutions#managed" },
    ],
  },
  {
    heading: "Platform & Sectors",
    links: [
      { label: "Course catalogue", href: "/courses" },
      { label: "LERNOVIQ LMS", href: "/lms" },
      { label: "Corporate & Enterprise", href: "/industries#corporate" },
      { label: "BFSI", href: "/industries#bfsi" },
      { label: "Government & Public", href: "/industries#government" },
    ],
  },
];

// Prefetch is off for site chrome: ~20 links on every page made production builds fetch every
// marketing page in the background, keeping pages busy (and E2E waits for idle never finishing).
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface font-display text-text">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-10 px-6 pt-14 pb-8">
        <div className="flex flex-col gap-4">
          <BrandLogo width={140} />
          <p className="max-w-[260px] text-sm leading-[1.6] text-neutral-text">
            One Partner. Complete Learning Solutions.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.heading} className="flex flex-col gap-2.5">
            <span className="mb-1 text-xs font-extrabold tracking-[0.14em] uppercase">
              {col.heading}
            </span>
            {col.links.map((l) => (
              <Link
                prefetch={false}
                key={l.label}
                href={l.href}
                className="text-[15px] text-neutral-text hover:text-primary-dark"
              >
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-x-6 gap-y-3 border-t border-border-subtle px-6 pt-5 pb-8 text-[13px] text-neutral-text">
        <span>© 2026 LERNOVIQ AI TECHNOLOGIES PRIVATE LIMITED</span>
        <span className="flex flex-wrap gap-5">
          <span>www.lernoviq.com</span>
          <span>www.lernoviq.in</span>
          <Link prefetch={false} href="/privacy" className="hover:text-primary-dark">
            Privacy
          </Link>
        </span>
      </div>
    </footer>
  );
}
