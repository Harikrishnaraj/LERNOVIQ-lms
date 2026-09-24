// Pricing & settings rules (pure, unit-tested): money parsing, validation, prerequisite cycles.

export const CURRENCIES = ["USD", "EUR", "GBP", "INR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const VISIBILITY_OPTIONS = [
  { value: "public", label: "Public: listed in the catalog" },
  { value: "unlisted", label: "Unlisted: only people with the link can find it" },
] as const;
export type Visibility = (typeof VISIBILITY_OPTIONS)[number]["value"];

export const MIN_PRICE_CENTS = 100; // 1.00
export const MAX_PRICE_CENTS = 999_999; // 9,999.99
export const MAX_PREREQUISITES = 5;

/** "49.99" / "49" / "49.9" -> cents. Rejects negatives, junk and more than two decimals. */
export function parseAmountToCents(input: string | number): number | null {
  const s = String(input).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatCentsAsAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface PricingInput {
  mode: string;
  amount: string;
  currency: string;
  certificateEnabled: boolean;
  visibility: string;
  prerequisiteIds: string[];
}

export interface PricingSettings {
  priceCents: number;
  currency: Currency;
  certificateEnabled: boolean;
  visibility: Visibility;
  prerequisiteIds: string[];
}

export type PricingValidation =
  | { ok: true; value: PricingSettings }
  | { ok: false; errors: Record<string, string> };

export function validatePricing(input: PricingInput): PricingValidation {
  const errors: Record<string, string> = {};

  let priceCents = 0;
  if (input?.mode !== "free" && input?.mode !== "paid") errors.mode = "Choose free or paid.";
  else if (input.mode === "paid") {
    const cents = parseAmountToCents(input.amount ?? "");
    if (cents === null) errors.amount = "Enter a price like 49.99.";
    else if (cents < MIN_PRICE_CENTS) errors.amount = "The minimum price is 1.00. Choose Free for no charge.";
    else if (cents > MAX_PRICE_CENTS) errors.amount = "The maximum price is 9,999.99.";
    else priceCents = cents;
  }

  if (!(CURRENCIES as readonly string[]).includes(input?.currency)) errors.currency = "Choose a currency.";
  if (!VISIBILITY_OPTIONS.some((v) => v.value === input?.visibility)) errors.visibility = "Choose a visibility.";

  const prereq = Array.isArray(input?.prerequisiteIds) ? input.prerequisiteIds : [];
  const unique = [...new Set(prereq.filter((p) => typeof p === "string"))];
  if (unique.length !== prereq.length) errors.prerequisiteIds = "Each prerequisite can only be added once.";
  else if (unique.length > MAX_PREREQUISITES) errors.prerequisiteIds = `At most ${MAX_PREREQUISITES} prerequisites.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      priceCents,
      currency: input.currency as Currency,
      certificateEnabled: Boolean(input.certificateEnabled),
      visibility: input.visibility as Visibility,
      prerequisiteIds: unique,
    },
  };
}

/**
 * Would making `courseId` require `newPrerequisites` create a loop (A needs B needs ... A)?
 * `graph` maps a course id to the course ids it currently requires.
 */
export function wouldCreateCycle(
  courseId: string,
  newPrerequisites: readonly string[],
  graph: ReadonlyMap<string, readonly string[]>,
): boolean {
  const seen = new Set<string>();
  const stack = [...newPrerequisites];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === courseId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(graph.get(id) ?? []));
  }
  return false;
}

/** Which required courses the learner has not completed yet. */
export function unmetPrerequisites(required: readonly string[], completed: ReadonlySet<string>): string[] {
  return required.filter((id) => !completed.has(id));
}
