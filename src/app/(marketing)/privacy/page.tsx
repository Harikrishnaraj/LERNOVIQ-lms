import type { Metadata } from "next";
import { LegalPage, LegalTable, type LegalSection } from "@/components/marketing/legal-page";

// T-293 (F-447): public privacy notice, from the reviewed draft and docs/GDPR_LEGAL_POSITIONS.md.
// Bracketed details await the company's decision; the page is not final until legal sign-off.
export const metadata: Metadata = {
  title: { absolute: "Privacy Policy | LERNOVIQ" },
  description: "What personal data LERNOVIQ collects, why, who it is shared with, how long it is kept, and your rights.",
};

const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    title: "1. Who we are",
    body: (
      <>
        <p>
          LERNOVIQ is run by Lernoviq AI Technologies Private Limited, a company registered in India [registered
          address]. We are responsible for your personal data as the controller, except where your employer or
          training provider manages your account (see section 3).
        </p>
        <ul>
          <li>Privacy contact: [privacy@lernoviq.com]</li>
          <li>Grievance officer (India): [name, email]</li>
          <li>EU representative: [name, address]</li>
          <li>UK representative: [name, address]</li>
        </ul>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "2. What we collect and why",
    body: (
      <>
        <p>
          We only collect what we need to run the platform. We do not sell your data, show advertising, or use
          advertising trackers.
        </p>
        <LegalTable
          head={["Data", "Examples", "Why we use it", "Legal basis"]}
          rows={[
            ["Account and profile", "Name, email, photo, bio, role", "Create and run your account; put your name on certificates", "Contract"],
            ["Sign-in and security", "Password (stored encrypted), two-factor settings, sign-in times, IP address, browser", "Keep your account safe and detect misuse", "Contract; legitimate interests"],
            ["Learning activity", "Courses joined, lessons completed, time spent, quiz answers and scores", "Deliver courses, track progress, award completion", "Contract"],
            ["Certificates", "Certificate number, course, date, your name", "Issue certificates and let others check they are genuine", "Contract; legitimate interests"],
            ["Your content", "Assignments, uploaded files, discussion posts, messages", "Let you submit work and take part in courses", "Contract"],
            ["Enquiries", "Name, email, company, message from our website forms", "Reply to you before any agreement", "Steps before a contract"],
            ["Marketing email", "Email address, your consent record", "Send product news, only if you agree", "Consent"],
            ["Activity records", "Actions taken by administrators and staff", "Security, accountability and resolving disputes", "Legitimate interests; legal obligation"],
          ]}
        />
        <p>We do not ask for sensitive information such as health, religion or ethnicity. Please do not include it in free-text fields.</p>
      </>
    ),
  },
  {
    id: "employers",
    title: "3. If your employer or training provider set up your account",
    body: (
      <>
        <p>
          When an organisation enrols you, that organisation decides how your learning data is used and is the
          controller. We process the data on its behalf under a written agreement.
        </p>
        <p>
          Your organisation&rsquo;s administrators can see your course progress, scores, time spent on lessons and
          certificates. They cannot see your password. Questions about how your organisation uses this information
          should go to your organisation first; we will help them answer.
        </p>
        <p>
          If you take a course through your organisation&rsquo;s own learning system, that system shares a learner
          reference with us so we can run the course and report your progress back to it.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "4. Who we share data with and where it is stored",
    body: (
      <>
        <p>We use a small number of service providers who process data only on our instructions and under data protection agreements.</p>
        <LegalTable
          head={["Provider", "What they do", "Location"]}
          rows={[
            ["Supabase", "Database, sign-in and file storage", "Mumbai, India"],
            ["Hostinger", "Hosts the application and website", "[location]"],
            ["[Resend or Hostinger Mail]", "Sends account and course emails", "[location]"],
          ]}
        />
        <p>We also share data when the law requires it, or to protect our users and platform.</p>
        <p>
          International transfers: your data is stored in India. If you are in the EU or UK, India does not have an
          adequacy decision, so we protect transfers with the European Commission&rsquo;s Standard Contractual Clauses
          and the UK transfer addendum, plus encryption in storage and in transit. [Confirm after legal review.]
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "5. How long we keep data",
    body: (
      <>
        <LegalTable
          head={["Data", "How long"]}
          rows={[
            ["Your account and learning records", "While your account is open; deleted 30 days after you ask us to delete it"],
            ["Certificate verification record", "[7 years, so certificates can still be checked; to be confirmed]"],
            ["Sign-in history", "12 months"],
            ["Website enquiries", "24 months"],
            ["Downloaded admin reports", "30 days"],
            ["Activity records", "2 years"],
            ["Backups", "30 days"],
          ]}
        />
        <p>We may keep specific data longer only when the law requires it or for an active legal claim.</p>
      </>
    ),
  },
  {
    id: "rights",
    title: "6. Your rights",
    body: (
      <>
        <p>You can ask us to:</p>
        <ul>
          <li>give you a copy of your data</li>
          <li>correct data that is wrong</li>
          <li>delete your data</li>
          <li>limit or object to how we use it</li>
          <li>move your data to another service</li>
          <li>withdraw consent to marketing at any time</li>
        </ul>
        <p>
          Signed-in users can download their data, delete their account and withdraw marketing consent in Settings
          &rarr; Privacy, and send any other request from the same page. Anyone else can use our{" "}
          <a href="/privacy/request" className="font-bold text-primary-dark underline">
            privacy request form
          </a>
          . We reply within one month, and will tell you if we need longer.
        </p>
        <p>
          If you are unhappy with our answer, you can complain to your local data protection authority, the UK
          Information Commissioner&rsquo;s Office, or the Data Protection Board of India.
        </p>
      </>
    ),
  },
  {
    id: "security",
    title: "7. Security, cookies, children and changes",
    body: (
      <>
        <p>
          Security: data is encrypted in transit and in storage. Access is limited by role, administrators must use
          two-factor sign-in, and administrator actions are logged. If a breach puts your data at risk, we will tell
          you and the relevant authorities as the law requires.
        </p>
        <p>
          Cookies: we use only the cookies needed to keep you signed in and to protect the site. We do not use
          advertising or tracking cookies, so we do not show a cookie banner.
        </p>
        <p>Children: LERNOVIQ is meant for adults. [Confirm: if learners under 18 are expected, we will need consent from a parent or guardian.]</p>
        <p>Changes: we will post any update on this page with a new date, and tell signed-in users about important changes.</p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      label="Legal"
      title="Privacy Policy"
      intro="This policy explains what personal data LERNOVIQ collects when you use our learning platform and website, why we use it, and the choices and rights you have."
      updated="[publication date]"
      sections={SECTIONS}
    />
  );
}
