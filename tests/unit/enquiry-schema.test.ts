import { describe, expect, it } from "vitest";
import { enquiryErrors, enquirySchema } from "@/features/enquiries/schema";

// T-264 (F-963, SECURITY §28): the contact form accepts only well-formed, bounded input.
const valid = {
  kind: "consultation" as const,
  name: "Asha Rao",
  email: "asha@example.com",
  organization: "Example Bank",
  country: "India",
  industry: "Banking, Financial Services & Insurance",
  solution: "Custom E-Learning Development",
  audience: "",
  timeline: "3–6 months",
  details: "We need an AML refresher for 2,000 staff.",
  consent: true,
};

describe("enquiry schema", () => {
  it("accepts a complete enquiry and normalises empty optional fields to null", () => {
    const parsed = enquirySchema.parse({ ...valid, name: "  Asha Rao  " });
    expect(parsed.name).toBe("Asha Rao");
    expect(parsed.audience).toBeNull();
    expect(parsed.timeline).toBe("3–6 months");
    expect(enquiryErrors(valid)).toBeNull();
  });

  it("reports each missing required field and a missing consent", () => {
    const errors = enquiryErrors({
      ...valid,
      name: " ",
      organization: "",
      details: "",
      consent: false,
    });
    expect(errors).toMatchObject({
      name: "Required",
      organization: "Required",
      details: "Required",
      consent: "Please confirm to continue.",
    });
  });

  it("rejects a bad email, options outside the list and oversized text", () => {
    expect(enquiryErrors({ ...valid, email: "not-an-email" })?.email).toBe(
      "Enter a valid work email",
    );
    expect(enquiryErrors({ ...valid, industry: "Crypto" })?.industry).toBeTruthy();
    expect(enquiryErrors({ ...valid, timeline: "Yesterday" })?.timeline).toBeTruthy();
    expect(enquiryErrors({ ...valid, details: "x".repeat(5001) })?.details).toBeTruthy();
    expect(enquiryErrors({ ...valid, kind: "spam" })?.kind).toBeTruthy();
  });
});
