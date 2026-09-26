import { describe, expect, it } from "vitest";
import { isSessionIdleExpired } from "@/lib/permissions/session";

describe("isSessionIdleExpired", () => {
  it("never expires when no timeout is configured", () => {
    expect(isSessionIdleExpired(undefined, null)).toBe(false);
    expect(isSessionIdleExpired("not-a-date", null)).toBe(false);
  });

  it("fails closed on a missing cookie once a timeout is configured", () => {
    expect(isSessionIdleExpired(undefined, 30)).toBe(true);
  });

  it("fails closed on an unparseable cookie", () => {
    expect(isSessionIdleExpired("garbage", 30)).toBe(true);
  });

  it("is not expired just under the timeout, and is expired just over it", () => {
    const now = new Date("2026-01-01T01:00:00.000Z");
    const under = new Date(now.getTime() - 29 * 60_000).toISOString();
    const over = new Date(now.getTime() - 31 * 60_000).toISOString();
    expect(isSessionIdleExpired(under, 30, now)).toBe(false);
    expect(isSessionIdleExpired(over, 30, now)).toBe(true);
  });
});
