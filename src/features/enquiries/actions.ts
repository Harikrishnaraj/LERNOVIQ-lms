"use server";

import { log } from "@/lib/log";
import { sendEmail } from "@/services/email";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { createAdminClient } from "@/services/supabase/admin";
import { enquiryErrors, enquirySchema, type EnquiryInput } from "./schema";

export type SubmitEnquiryResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// T-264 (F-963, SECURITY §28): a Server Action is a public endpoint, so everything is re-validated
// here. The enquiry is stored first (the source of truth); the email is a best-effort notification.
export async function submitEnquiry(input: EnquiryInput): Promise<SubmitEnquiryResult> {
  const fieldErrors = enquiryErrors(input);
  const parsed = enquirySchema.safeParse(input);
  if (fieldErrors || !parsed.success) {
    return {
      ok: false,
      error: "Please complete the highlighted fields.",
      fieldErrors: fieldErrors ?? {},
    };
  }
  const e = parsed.data;

  if (!(await rateLimit("contact-enquiry", await clientIp(), e.email.toLowerCase()))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const { error } = await createAdminClient().from("enquiries").insert({
    kind: e.kind,
    name: e.name,
    email: e.email,
    organization: e.organization,
    country: e.country,
    industry: e.industry,
    solution: e.solution,
    audience: e.audience,
    timeline: e.timeline,
    details: e.details,
  });
  if (error) {
    log.error("enquiry.insert_failed", { detail: error.message });
    return { ok: false, error: "We couldn't send your enquiry. Please try again shortly." };
  }

  const to = process.env.CONTACT_NOTIFY_EMAIL;
  if (to) {
    const rows: [string, string | null][] = [
      ["Type", e.kind === "demo" ? "LMS demo" : "Consultation"],
      ["Name", e.name],
      ["Work email", e.email],
      ["Organization", e.organization],
      ["Country or region", e.country],
      ["Industry", e.industry],
      ["Solution of interest", e.solution],
      ["Learner audience", e.audience],
      ["Timeline", e.timeline],
    ];
    const html = `<table>${rows
      .filter(([, v]) => v)
      .map(([k, v]) => `<tr><th align="left">${k}</th><td>${escapeHtml(v!)}</td></tr>`)
      .join("")}</table><p>${escapeHtml(e.details).replace(/\n/g, "<br>")}</p>`;
    const sent = await sendEmail({
      to,
      subject:
        `New ${e.kind === "demo" ? "LMS demo" : "consultation"} enquiry from ${e.organization}`.slice(
          0,
          200,
        ),
      html,
    });
    if (!sent.ok) log.error("enquiry.email_failed", { detail: sent.error });
  } else {
    log.warn("enquiry.email_skipped", { detail: "CONTACT_NOTIFY_EMAIL is not set" });
  }

  return { ok: true };
}
