// Video resume-position helpers (pure).

const MAX_SECONDS = 60 * 60 * 24; // a lesson video longer than a day is not a real position

/** Whole, non-negative seconds within a sane range; null for anything else (NaN, negative, huge). */
export function normalizePosition(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.floor(seconds);
  return whole > MAX_SECONDS ? null : whole;
}

/**
 * Where to start playback: the saved position, unless the learner had essentially finished
 * (within the last 5 seconds) in which case they start over.
 */
export function startPosition(saved: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return saved;
  return saved >= duration - 5 ? 0 : saved;
}

/** Throttle: persist at most once per interval while playing. */
export function shouldPersist(lastSavedAtMs: number, nowMs: number, intervalMs = 10_000): boolean {
  return nowMs - lastSavedAtMs >= intervalMs;
}
