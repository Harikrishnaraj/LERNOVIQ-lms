// Pure dashboard helpers (no I/O), unit-tested in tests/unit/dashboard-logic.test.ts.

import { INTEREST_OPTIONS } from "@/features/onboarding/options";

/** Display name for the greeting: profile name, else the email local part, else a neutral word. */
export function greetingName(fullName: string | null | undefined, email: string | null | undefined) {
  const named = fullName?.trim();
  if (named) return named.split(/\s+/)[0];
  const local = email?.split("@")[0]?.trim();
  return local ? local : "there";
}

/** Interest slugs the learner picked during onboarding that are valid options. */
export function interestSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const valid = new Set<string>(INTEREST_OPTIONS.map((o) => o.value));
  return raw.filter((v): v is string => typeof v === "string" && valid.has(v));
}

export interface RecommendableCourse {
  id: string;
}

/**
 * Merges candidate lists (one per interest, best first) round-robin so every interest is
 * represented, drops courses the learner already has, and caps the result.
 */
export function pickRecommendations<T extends RecommendableCourse>(
  candidateLists: T[][],
  excludeIds: ReadonlySet<string>,
  limit: number,
): T[] {
  const seen = new Set(excludeIds);
  const out: T[] = [];
  for (let round = 0; out.length < limit; round++) {
    let progressed = false;
    for (const list of candidateLists) {
      const item = list[round];
      if (item === undefined) continue;
      progressed = true;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) break;
    }
    if (!progressed) break;
  }
  return out;
}

/** Start of the given day in UTC, used to count "completed today". */
export function startOfUtcDay(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}
