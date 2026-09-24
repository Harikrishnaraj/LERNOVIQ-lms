import { z } from "zod";
import { LANGUAGE_OPTIONS, LEVEL_OPTIONS } from "@/features/catalog/filters";

const levels = LEVEL_OPTIONS.map((o) => o.value) as [string, ...string[]];
const languages = LANGUAGE_OPTIONS.map((o) => o.value) as [string, ...string[]];

/** One item per line: trimmed, blanks and duplicates dropped, capped in number and length. */
function linesSchema(noun: string) {
  return z
    .string()
    .max(4000, `Keep the ${noun}s shorter.`)
    .transform((raw) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const line of raw.split(/\r?\n/)) {
        const t = line.trim();
        if (t === "" || seen.has(t.toLowerCase())) continue;
        seen.add(t.toLowerCase());
        out.push(t);
      }
      return out;
    })
    .refine((v) => v.length <= 8, `Add at most 8 ${noun}s.`)
    .refine((v) => v.every((l) => l.length <= 200), `Keep each ${noun} under 200 characters.`);
}

/** Course basics (wizard step 1, F-202). Empty strings from form fields are treated as absent. */
export const basicsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Give the course a title of at least 3 characters.")
    .max(120, "Keep the title under 120 characters."),
  subtitle: z
    .string()
    .trim()
    .max(200, "Keep the subtitle under 200 characters.")
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  categorySlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Pick a category from the list.")
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  description: z.string().trim().max(5000, "Keep the description under 5000 characters."),
  outcomes: linesSchema("outcome"),
  requirements: linesSchema("requirement"),
  level: z.enum(levels, { message: "Choose a level." }),
  language: z.enum(languages, { message: "Choose a language." }),
});

export type BasicsInput = z.input<typeof basicsSchema>;
export type BasicsData = z.output<typeof basicsSchema>;

/** URL slug from a title: lowercase, ascii, dash separated. Never empty. */
export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? "course" : slug;
}

/** Candidate slugs to try in order: the plain slug, then numbered, then random suffixes. */
export function slugCandidates(title: string, random = () => Math.random().toString(36).slice(2, 6)): string[] {
  const base = slugify(title);
  return [base, `${base}-2`, `${base}-3`, `${base}-${random()}`, `${base}-${random()}${random()}`];
}
