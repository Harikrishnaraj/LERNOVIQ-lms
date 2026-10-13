import { log } from "@/lib/log";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";

// Server-only: uses the service-role key (never NEXT_PUBLIC_*).
// ponytail: Postgres-backed sliding window; concurrent requests can slightly
// overshoot the limit. Swap for Redis/Upstash if throughput demands it.
const LIMITS = {
  login: { limit: 10, windowSeconds: 15 * 60 },
  "password-reset": { limit: 5, windowSeconds: 60 * 60 },
  "verify-email": { limit: 5, windowSeconds: 60 * 60 },
  "assessment-submit": { limit: 30, windowSeconds: 60 * 60 },
  "certificate-verify": { limit: 10, windowSeconds: 10 * 60 },
  "discussion-post": { limit: 20, windowSeconds: 10 * 60 },
  "discussion-react": { limit: 60, windowSeconds: 10 * 60 },
  "review-report": { limit: 20, windowSeconds: 10 * 60 },
  "api-request": { limit: 300, windowSeconds: 10 * 60 },
  "instructor-message": { limit: 20, windowSeconds: 10 * 60 },
  "upload-initiate": { limit: 30, windowSeconds: 10 * 60 },
  "analytics-export": { limit: 20, windowSeconds: 10 * 60 },
} as const;

export type RateLimitedAction = keyof typeof LIMITS;

export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a while and try again.";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}

// Shared NATs/offices sit behind one IP, so the per-IP bucket is looser than
// the per-subject (email) one.
const IP_LIMIT_MULTIPLIER = 30;

// The auth endpoints guard credentials and outbound email, so they fail closed (GAP-124): a broken
// limiter must not silently re-open brute force or email flooding. Every other action fails open
// so an outage in the limiter doesn't take the rest of the app down with it.
const FAIL_CLOSED: ReadonlySet<RateLimitedAction> = new Set(["login", "password-reset", "verify-email"]);

// Returns true when the request may proceed. The caller's IP and the optional
// subject (e.g. the target email) are checked independently: either one over
// its limit blocks. Infrastructure errors are logged and decided by FAIL_CLOSED.
export async function rateLimit(
  action: RateLimitedAction,
  ip: string,
  subject?: string,
): Promise<boolean> {
  const failOpen = !FAIL_CLOSED.has(action);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log.error("rate_limit.not_configured", { detail: "service role key missing; limiting disabled" });
    // Local development often runs without the service key; a production server never should.
    return failOpen || process.env.NODE_ENV !== "production";
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { limit, windowSeconds } = LIMITS[action];

  const buckets = [{ id: `ip:${ip}`, limit: limit * IP_LIMIT_MULTIPLIER }];
  if (subject) buckets.push({ id: subject, limit });

  for (const bucket of buckets) {
    const { data, error } = await db.rpc("check_rate_limit", {
      p_key: `${action}:${bucket.id.toLowerCase()}`,
      p_limit: bucket.limit,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      log.error("rate_limit.check_failed", { action, message: error.message });
      return failOpen;
    }
    if (data === false) return false;
  }
  return true;
}
