import { describe, expect, it } from "vitest";
import { daysUntilExpiry, EXPIRY_WARNING_DAYS, expiryState, validateExpiry } from "@/features/content-server/rules";

// F-430, F-431: the shared expiry rules (UTC end of day, future only, one warning window).
const NOW = new Date("2026-10-30T12:00:00.000Z");

describe("validateExpiry (UTC end of day, future only)", () => {
  it("stores the chosen day as 23:59:59.999 UTC", () => {
    expect(validateExpiry("2026-12-31", NOW)).toEqual({ ok: true, value: "2026-12-31T23:59:59.999Z" });
  });

  it("accepts today, because today's end of day is still ahead", () => {
    expect(validateExpiry("2026-10-30", NOW)).toEqual({ ok: true, value: "2026-10-30T23:59:59.999Z" });
  });

  it("rejects yesterday and the instant the day has ended", () => {
    expect(validateExpiry("2026-10-29", NOW).ok).toBe(false);
    expect(validateExpiry("2026-10-30", new Date("2026-10-30T23:59:59.999Z")).ok).toBe(false);
  });

  it("rejects dates that do not exist and wrong formats; blank means no expiry", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "30/10/2026", "2026-1-1", "tomorrow"]) {
      expect(validateExpiry(bad, NOW).ok).toBe(false);
    }
    expect(validateExpiry("", NOW)).toEqual({ ok: true, value: null });
    expect(validateExpiry(undefined, NOW)).toEqual({ ok: true, value: null });
  });
});

describe("expiryState", () => {
  const at = (iso: string) => expiryState(iso, NOW);

  it("is none without an expiry", () => {
    expect(expiryState(null, NOW)).toBe("none");
  });

  it("is expired at and after the end instant", () => {
    expect(at("2026-10-30T12:00:00.000Z")).toBe("expired");
    expect(at("2026-10-29T23:59:59.999Z")).toBe("expired");
  });

  it("warns inside the window and is active outside it", () => {
    const edge = new Date(NOW.getTime() + EXPIRY_WARNING_DAYS * 86_400_000).toISOString();
    const beyond = new Date(NOW.getTime() + EXPIRY_WARNING_DAYS * 86_400_000 + 1).toISOString();
    expect(at(edge)).toBe("expiring");
    expect(at(beyond)).toBe("active");
    expect(at("2026-10-31T23:59:59.999Z")).toBe("expiring");
  });
});

describe("daysUntilExpiry", () => {
  it("rounds up whole days and is null without an expiry", () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
    expect(daysUntilExpiry("2026-10-31T00:00:00.000Z", NOW)).toBe(1);
    expect(daysUntilExpiry("2026-11-01T12:00:00.000Z", NOW)).toBe(2);
    expect(daysUntilExpiry("2026-10-29T12:00:00.000Z", NOW)).toBe(-1);
  });
});
