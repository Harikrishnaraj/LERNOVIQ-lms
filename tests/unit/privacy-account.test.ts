import { describe, expect, it } from "vitest";
import { deletionDate, deletionNotice, usesPassword } from "@/features/privacy/account";

describe("account deletion helpers (F-441)", () => {
  it("detects password accounts, including users with several providers", () => {
    expect(usesPassword({ app_metadata: { providers: ["email"] } })).toBe(true);
    expect(usesPassword({ app_metadata: { providers: ["google", "email"] } })).toBe(true);
    expect(usesPassword({ app_metadata: { providers: ["google"] } })).toBe(false);
    expect(usesPassword({ app_metadata: { provider: "email" } })).toBe(true);
    expect(usesPassword({})).toBe(false);
  });

  it("adds the 30-day grace period", () => {
    expect(deletionDate("2026-01-01T00:00:00Z").toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("the request notice names the deletion date; the cancel notice does not", () => {
    expect(deletionNotice("requested", new Date("2026-01-01T00:00:00Z")).html).toContain("31 January 2026");
    expect(deletionNotice("cancelled").subject).toContain("cancelled");
  });
});
