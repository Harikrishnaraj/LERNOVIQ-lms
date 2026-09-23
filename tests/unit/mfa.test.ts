import { describe, expect, it, vi } from "vitest";
import { needsMfa, safeNextPath } from "@/lib/permissions/mfa";

const clientWith = (result: unknown) =>
  ({
    auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue(result) } },
  }) as never;

describe("needsMfa", () => {
  it("is false at aal2", async () => {
    expect(await needsMfa(clientWith({ data: { currentLevel: "aal2" }, error: null }))).toBe(false);
  });
  it("is true at aal1", async () => {
    expect(await needsMfa(clientWith({ data: { currentLevel: "aal1" }, error: null }))).toBe(true);
  });
  it("fails closed on error", async () => {
    expect(await needsMfa(clientWith({ data: null, error: new Error("x") }))).toBe(true);
  });
});

describe("safeNextPath", () => {
  it("keeps same-origin paths", () => expect(safeNextPath("/admin/users")).toBe("/admin/users"));
  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBe("/admin");
    expect(safeNextPath("//evil.example")).toBe("/admin");
    expect(safeNextPath(null)).toBe("/admin");
  });
});
