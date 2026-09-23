import { describe, expect, it } from "vitest";
import { normalizePosition, shouldPersist, startPosition } from "@/features/player/position";

describe("normalizePosition", () => {
  it("floors valid positions to whole seconds", () => {
    expect(normalizePosition(12.9)).toBe(12);
    expect(normalizePosition(0)).toBe(0);
  });
  it("rejects invalid values", () => {
    for (const bad of [-1, NaN, Infinity, "5", null, undefined, 60 * 60 * 24 + 1]) {
      expect(normalizePosition(bad)).toBeNull();
    }
  });
});

describe("startPosition", () => {
  it("resumes at the saved position", () => {
    expect(startPosition(42, 100)).toBe(42);
  });
  it("restarts when the learner had essentially finished", () => {
    expect(startPosition(97, 100)).toBe(0);
  });
  it("trusts the saved position when duration is unknown", () => {
    expect(startPosition(30, NaN)).toBe(30);
  });
});

describe("shouldPersist", () => {
  it("throttles to one save per interval", () => {
    expect(shouldPersist(0, 10_000)).toBe(true);
    expect(shouldPersist(1_000, 5_000)).toBe(false);
    expect(shouldPersist(1_000, 11_000)).toBe(true);
  });
});
