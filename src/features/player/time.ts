// Learning-time tracking (pure helpers, T-292). A heartbeat counts only while the tab is visible
// and the learner has done something recently, so an abandoned open tab does not add time.

export const HEARTBEAT_SECONDS = 30;
export const MAX_HEARTBEAT_SECONDS = 60;
export const IDLE_LIMIT_MS = 120_000;

export function shouldCountHeartbeat(visible: boolean, lastActivityMs: number, nowMs: number): boolean {
  return visible && nowMs - lastActivityMs < IDLE_LIMIT_MS;
}

/** Whole seconds from 1 to the per-heartbeat cap; null for anything else. */
export function normalizeHeartbeat(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const whole = Math.floor(seconds);
  return whole < 1 || whole > MAX_HEARTBEAT_SECONDS ? null : whole;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
