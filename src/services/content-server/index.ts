import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Content server signing (ADR-038, SECURITY §27). Server-only. Keys are derived from the
 * service-role key (like services/scorm/token.ts), each with its own label, so no extra secret has
 * to be configured and a value signed for one purpose never verifies for another.
 */

function key(label: string): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", secret).update(label).digest();
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * The content origin dispatches run on: the dedicated SCORM content origin, and only when it is a
 * different host from the app. Untrusted course code runs there with allow-same-origin, so it must
 * never be the app's own origin (ADR-029); without one, the content server is unavailable.
 */
export function dispatchContentOrigin(
  contentOrigin = process.env.NEXT_PUBLIC_SCORM_CONTENT_ORIGIN,
  appUrl = process.env.NEXT_PUBLIC_APP_URL,
): string | null {
  try {
    if (!contentOrigin) return null;
    const content = new URL(contentOrigin);
    if (appUrl && new URL(appUrl).host === content.host) return null;
    return content.origin;
  } catch {
    return null;
  }
}

export const PUBLIC_ID = /^[0-9a-f]{32}$/;

/** Signature embedded in a dispatch package next to its public ID: proves the zip came from us. */
export function signDispatchId(publicId: string): string {
  return createHmac("sha256", key("content-dispatch-id-v1")).update(publicId).digest("base64url");
}

export function verifyDispatchId(publicId: string, signature: string): boolean {
  if (!PUBLIC_ID.test(publicId) || typeof signature !== "string" || signature.length > 100)
    return false;
  return safeEqual(signature, signDispatchId(publicId));
}

/**
 * Keyed hash of the LMS's learner ID, scoped to one licence (SECURITY §27: no learner PII stored).
 * The same learner gets the same key across a licence's courses, so they hold one seat.
 */
export function learnerKey(licenceId: string, lmsLearnerId: string): string {
  return createHmac("sha256", key("content-learner-key-v1"))
    .update(`${licenceId}:${lmsLearnerId}`)
    .digest("hex");
}

/**
 * Capability for one registration's content files: /api/dispatch/content/<token>/<file>. The
 * registration is re-checked on every request (licence revoked or expired => refused at once), so
 * the expiry only bounds how long a leaked URL is useful.
 */
export const DISPATCH_TOKEN_TTL_SECONDS = 12 * 60 * 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tokenSig(registrationId: string, lessonId: string, exp: number): string {
  return createHmac("sha256", key("content-dispatch-token-v1"))
    .update(`${registrationId}.${lessonId}.${exp}`)
    .digest("base64url");
}

export function signDispatchToken(
  registrationId: string,
  lessonId: string,
  now = Date.now(),
): string {
  const exp = Math.floor(now / 1000) + DISPATCH_TOKEN_TTL_SECONDS;
  return `${registrationId}.${lessonId}.${exp}.${tokenSig(registrationId, lessonId, exp)}`;
}

export function verifyDispatchToken(
  token: string,
  now = Date.now(),
): { registrationId: string; lessonId: string } | null {
  const [registrationId, lessonId, expText, sig, ...rest] = token.split(".");
  if (rest.length || !registrationId || !lessonId || !expText || !sig) return null;
  if (!UUID.test(registrationId) || !UUID.test(lessonId) || !/^\d+$/.test(expText)) return null;
  const exp = Number(expText);
  if (exp * 1000 <= now) return null;
  return safeEqual(sig, tokenSig(registrationId, lessonId, exp))
    ? { registrationId, lessonId }
    : null;
}

/** CSP for dispatch responses: course code needs inline scripts/eval; framing only by the licence's LMS origins. */
export function dispatchCsp(allowedOrigins: string[] | "any"): string {
  const ancestors = allowedOrigins === "any" ? "*" : ["'self'", ...allowedOrigins].join(" ");
  return [
    "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'",
    `frame-ancestors ${ancestors}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}
