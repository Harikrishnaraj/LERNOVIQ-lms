import { z } from "zod";

// Contact form model (T-264, F-963, SECURITY §28). Option lists come from the design export's
// Contact page; the server accepts nothing outside them.
export const INDUSTRY_OPTIONS = [
  "Corporate & Enterprise",
  "Banking, Financial Services & Insurance",
  "Government & Public Institutions",
  "Training provider",
  "Other",
] as const;

export const SOLUTION_OPTIONS = [
  "Learning Consulting & Curriculum Design",
  "Custom E-Learning Development",
  "LERNOVIQ LMS & Learning Technology",
  "Assessments & Certification Solutions",
  "Localization & Video Learning",
  "Managed Learning Services",
  "Not sure yet",
] as const;

export const AUDIENCE_OPTIONS = [
  "Under 100",
  "100–1,000",
  "1,000–10,000",
  "Over 10,000",
  "Not sure yet",
] as const;
export const TIMELINE_OPTIONS = [
  "Within 3 months",
  "3–6 months",
  "6–12 months",
  "Exploring options",
] as const;

const required = (max: number) =>
  z.string().trim().min(1, "Required").max(max, `Use ${max} characters or fewer`);
const optionalOf = <T extends readonly [string, ...string[]]>(options: T) =>
  z
    .union([z.enum(options), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null));

export const enquirySchema = z.object({
  kind: z.enum(["consultation", "demo"]),
  name: required(120),
  email: z.string().trim().max(254).pipe(z.email("Enter a valid work email")),
  organization: required(160),
  country: required(80),
  industry: z.enum(INDUSTRY_OPTIONS, "Required"),
  solution: z.enum(SOLUTION_OPTIONS, "Required"),
  audience: optionalOf(AUDIENCE_OPTIONS),
  timeline: optionalOf(TIMELINE_OPTIONS),
  details: required(5000),
  consent: z.literal(true, "Please confirm to continue."),
});

export type EnquiryInput = z.input<typeof enquirySchema>;
export type Enquiry = z.output<typeof enquirySchema>;

/** Field name → first error message, for the form. */
export function enquiryErrors(input: unknown): Record<string, string> | null {
  const parsed = enquirySchema.safeParse(input);
  if (parsed.success) return null;
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}
