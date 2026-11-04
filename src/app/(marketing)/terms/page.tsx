import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/marketing/legal-page";

// T-293 (F-447): terms of use. Drafted for counsel; bracketed details await the company's decision.
export const metadata: Metadata = {
  title: { absolute: "Terms of Use | LERNOVIQ" },
  description: "The terms that apply when you use the LERNOVIQ website and learning platform.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "agreement",
    title: "1. Agreement",
    body: (
      <p>
        These terms apply when you use the LERNOVIQ website and learning platform, provided by Lernoviq AI
        Technologies Private Limited [registered address]. By creating an account or using the platform you agree to
        them. If your organisation signed a separate agreement with us, that agreement takes priority where the two
        differ.
      </p>
    ),
  },
  {
    id: "accounts",
    title: "2. Your account",
    body: (
      <ul>
        <li>Give accurate details and keep them up to date.</li>
        <li>Keep your password and two-factor device safe; you are responsible for activity on your account.</li>
        <li>Tell us straight away at [support@lernoviq.com] if you think someone else has used your account.</li>
        <li>Accounts are personal and may not be shared.</li>
      </ul>
    ),
  },
  {
    id: "acceptable-use",
    title: "3. Acceptable use",
    body: (
      <>
        <p>You must not:</p>
        <ul>
          <li>break the law, or upload content you do not have the right to share;</li>
          <li>harass others, or post offensive, misleading or harmful material in discussions or messages;</li>
          <li>cheat in assessments, or share assessment answers;</li>
          <li>try to access data or areas you are not allowed to, or disrupt the platform;</li>
          <li>copy, resell or redistribute course content outside the platform.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules.</p>
      </>
    ),
  },
  {
    id: "content",
    title: "4. Course content and your content",
    body: (
      <>
        <p>
          Course materials belong to LERNOVIQ, its instructors or its licensors. You may use them for your own
          learning while you have access.
        </p>
        <p>
          You keep ownership of what you submit, such as assignments and posts. You allow us to store and show it as
          needed to run the course, for example to your instructor or other learners in a discussion.
        </p>
      </>
    ),
  },
  {
    id: "certificates",
    title: "5. Certificates",
    body: (
      <p>
        Certificates confirm that you met a course&rsquo;s published completion rules. Anyone with a certificate&rsquo;s
        number can check that it is genuine. We may revoke a certificate issued by mistake or obtained by cheating.
      </p>
    ),
  },
  {
    id: "availability",
    title: "6. Availability and changes",
    body: (
      <p>
        We work to keep the platform available but cannot promise it will never be interrupted. We may change or
        retire features, and will give reasonable notice of changes that significantly affect you.
      </p>
    ),
  },
  {
    id: "liability",
    title: "7. Liability",
    body: (
      <p>
        [To be drafted by counsel: limits of liability, exclusions, and what cannot be excluded under applicable
        consumer law.]
      </p>
    ),
  },
  {
    id: "ending",
    title: "8. Ending your use",
    body: (
      <p>
        You can delete your account at any time in Settings &rarr; Privacy. We may suspend or close an account that
        breaks these terms. What happens to your data is set out in our{" "}
        <a href="/privacy" className="font-bold text-primary-dark underline">
          Privacy Policy
        </a>
        .
      </p>
    ),
  },
  {
    id: "law",
    title: "9. Governing law and contact",
    body: (
      <p>
        These terms are governed by the laws of India [confirm; courts of (city)]. This does not remove rights you
        have under the consumer law of the country where you live. Questions: [support@lernoviq.com].
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      label="Legal"
      title="Terms of Use"
      intro="Please read these terms before using LERNOVIQ. They explain what you can expect from us and what we expect from you."
      updated="[publication date]"
      sections={SECTIONS}
    />
  );
}
