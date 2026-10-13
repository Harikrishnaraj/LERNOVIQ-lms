// Pure rules for the content server (ADR-041, F-520). Unit-tested; the database enforces the same
// limits (20261012100000_content_server.sql), this gives clear messages before a write.

export const CLIENT_NAME_MAX = 200;
export const LICENCE_NAME_MAX = 200;
export const NOTES_MAX = 2000;
export const ORIGINS_MAX = 50;
export const SEATS_MAX = 1_000_000;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateClientName(input: unknown): Parsed<string> {
  const name = typeof input === "string" ? input.trim() : "";
  if (!name) return { ok: false, error: "Enter the customer's name." };
  if (name.length > CLIENT_NAME_MAX)
    return { ok: false, error: `Use at most ${CLIENT_NAME_MAX} characters.` };
  return { ok: true, value: name };
}

export function validateContactEmail(input: unknown): Parsed<string | null> {
  const email = typeof input === "string" ? input.trim() : "";
  if (!email) return { ok: true, value: null };
  if (email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return { ok: false, error: "Enter a valid email address." };
  return { ok: true, value: email };
}

export function validateNotes(input: unknown): Parsed<string | null> {
  const notes = typeof input === "string" ? input.trim() : "";
  if (!notes) return { ok: true, value: null };
  if (notes.length > NOTES_MAX)
    return { ok: false, error: `Notes can be at most ${NOTES_MAX} characters.` };
  return { ok: true, value: notes };
}

export function validateLicenceName(input: unknown): Parsed<string> {
  const name = typeof input === "string" ? input.trim() : "";
  if (!name) return { ok: false, error: "Give the licence a name, for example the contract year." };
  if (name.length > LICENCE_NAME_MAX)
    return { ok: false, error: `Use at most ${LICENCE_NAME_MAX} characters.` };
  return { ok: true, value: name };
}

/** Blank means unlimited seats. */
export function validateSeatLimit(input: unknown): Parsed<number | null> {
  const text =
    typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
  if (!text) return { ok: true, value: null };
  if (!/^\d+$/.test(text))
    return { ok: false, error: "Seats must be a whole number, or blank for unlimited." };
  const n = Number(text);
  if (n < 1 || n > SEATS_MAX)
    return {
      ok: false,
      error: `Seats must be between 1 and ${SEATS_MAX.toLocaleString("en-US")}.`,
    };
  return { ok: true, value: n };
}

/** A YYYY-MM-DD date; the licence works through the end of that day (UTC). Blank means no expiry. */
export function validateExpiry(input: unknown, now = new Date()): Parsed<string | null> {
  const text = typeof input === "string" ? input.trim() : "";
  if (!text) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text))
    return { ok: false, error: "Enter the expiry date as YYYY-MM-DD." };
  const end = new Date(`${text}T23:59:59.999Z`);
  if (Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== text)
    return { ok: false, error: "That date does not exist." };
  if (end.getTime() <= now.getTime())
    return { ok: false, error: "The expiry date must be in the future." };
  return { ok: true, value: end.toISOString() };
}

/**
 * Normalizes one embedding address to the origin a browser sends (scheme://host[:port], lowercase,
 * no path). Accepts what admins paste: a full URL of the customer's LMS works.
 */
export function normalizeOrigin(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname || url.username || url.password) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(url.hostname))
    return null;
  return url.origin;
}

/** One address per line (or comma separated). At least one is required: an empty list would let no LMS launch. */
export function parseOrigins(input: unknown): Parsed<string[]> {
  const raw = typeof input === "string" ? input : Array.isArray(input) ? input.join("\n") : "";
  const parts = raw
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0)
    return {
      ok: false,
      error: "Add at least one LMS web address, for example https://lms.customer.com.",
    };
  const out: string[] = [];
  for (const part of parts) {
    const origin = normalizeOrigin(part);
    if (!origin) return { ok: false, error: `“${part.slice(0, 80)}” is not a valid web address.` };
    if (!out.includes(origin)) out.push(origin);
  }
  if (out.length > ORIGINS_MAX)
    return { ok: false, error: `Use at most ${ORIGINS_MAX} addresses.` };
  return { ok: true, value: out };
}

export type LicenceStatus = "active" | "revoked" | "expired";

export function licenceStatus(
  l: { revokedAt: string | null; expiresAt: string | null },
  now = new Date(),
): LicenceStatus {
  if (l.revokedAt) return "revoked";
  if (l.expiresAt && new Date(l.expiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

/** The YYYY-MM-DD part of a stored expiry, for the edit form. */
export function expiryInputValue(expiresAt: string | null): string {
  return expiresAt ? expiresAt.slice(0, 10) : "";
}
