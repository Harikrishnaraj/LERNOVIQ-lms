import { describe, expect, it } from "vitest";
import { formatDuration, formatPrice } from "@/lib/utils/format";

describe("formatPrice", () => {
  it("shows Free for zero and currency otherwise", () => {
    expect(formatPrice(0)).toBe("Free");
    expect(formatPrice(4900)).toBe("$49.00");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(90)).toBe("1 h 30 min");
  });
});
