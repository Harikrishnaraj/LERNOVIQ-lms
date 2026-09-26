export const LAST_ACTIVE_COOKIE = "lms_last_active";

/**
 * Is the session idle-expired? Off entirely when no timeout is configured. Once one is set, a
 * missing or unparseable cookie counts as expired (fails closed) rather than granting an
 * unbounded session — the cookie only ever disappears if it was never set (a session that
 * predates the policy) or was tampered with, and both cases should re-authenticate.
 */
export function isSessionIdleExpired(lastActiveCookie: string | undefined, timeoutMinutes: number | null, now: Date = new Date()): boolean {
  if (timeoutMinutes === null) return false;
  if (!lastActiveCookie) return true;
  const lastActive = new Date(lastActiveCookie);
  if (Number.isNaN(lastActive.getTime())) return true;
  const elapsedMinutes = (now.getTime() - lastActive.getTime()) / 60_000;
  return elapsedMinutes > timeoutMinutes;
}
