import type { Metadata } from "next";
import { PrivacyRequestForm } from "@/components/marketing/privacy-request-form";
import { PageHero, container, heroLead } from "@/components/marketing/ui";

// T-296 (F-449): privacy rights requests from people without a LERNOVIQ account.
export const metadata: Metadata = {
  title: { absolute: "Privacy request | LERNOVIQ" },
  description: "Ask LERNOVIQ for a copy of your data, a correction, deletion, or another privacy right.",
};

export default function PrivacyRequestPage() {
  return (
    <>
      <PageHero label="Privacy" title="Make a privacy request">
        <p className={`${heroLead} max-w-[720px]`}>
          Use this form if you do not have a LERNOVIQ account. If you do, sign in and use Settings &rarr; Privacy instead.
          We reply within one month.
        </p>
      </PageHero>
      <div className={`${container} py-14`}>
        <PrivacyRequestForm />
      </div>
    </>
  );
}
