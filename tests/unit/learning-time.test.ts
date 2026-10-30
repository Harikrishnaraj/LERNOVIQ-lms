import { describe, expect, it } from "vitest";
import { formatDuration, IDLE_LIMIT_MS, normalizeHeartbeat, shouldCountHeartbeat } from "@/features/player/time";

describe("shouldCountHeartbeat", () => {
  it("counts a visible tab with recent activity", () => {
    expect(shouldCountHeartbeat(true, 1_000, 1_000 + 30_000)).toBe(true);
  });
  it("does not count a hidden tab", () => {
    expect(shouldCountHeartbeat(false, 1_000, 2_000)).toBe(false);
  });
  it("does not count an idle learner", () => {
    expect(shouldCountHeartbeat(true, 0, IDLE_LIMIT_MS)).toBe(false);
  });
});

describe("normalizeHeartbeat", () => {
  it("accepts 1 to 60 whole seconds", () => {
    expect(normalizeHeartbeat(30)).toBe(30);
    expect(normalizeHeartbeat(60)).toBe(60);
    expect(normalizeHeartbeat(1.9)).toBe(1);
  });
  it("rejects zero, negative, over the cap, NaN and non-numbers", () => {
    for (const v of [0, -5, 61, 3600, NaN, Infinity, "30", null]) expect(normalizeHeartbeat(v)).toBeNull();
  });
});

describe("formatDuration", () => {
  it("shows minutes, and hours when there are any", () => {
    expect(formatDuration(90)).toBe("1m");
    expect(formatDuration(5400)).toBe("1h 30m");
    expect(formatDuration(-3)).toBe("0m");
  });
});
