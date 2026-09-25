import { describe, expect, it } from "vitest";
import { avatarPathFromUrl, validateName, validatePasswordChange } from "@/features/profile/rules";

describe("validateName", () => {
  it("trims and collapses whitespace", () => {
    expect(validateName("  Ada   Lovelace ")).toEqual({ ok: true, value: "Ada Lovelace" });
  });

  it("rejects empty, non-string, over-long and control characters", () => {
    expect(validateName("   ")).toEqual({ ok: false, error: "Enter your name." });
    expect(validateName(null)).toEqual({ ok: false, error: "Enter your name." });
    expect(validateName("x".repeat(101))).toMatchObject({ ok: false });
    expect(validateName("x".repeat(100))).toMatchObject({ ok: true });
    expect(validateName("Ada\u0007")).toMatchObject({ ok: false });
  });
});

describe("validatePasswordChange", () => {
  const ok = { current: "old-password", next: "brand-new-pass", confirm: "brand-new-pass" };

  it("accepts a proper change", () => {
    expect(validatePasswordChange(ok)).toEqual({ ok: true });
  });

  it("reports each problem on its field", () => {
    expect(validatePasswordChange({ current: "", next: "short", confirm: "other" })).toEqual({
      ok: false,
      errors: { current: "Enter your current password.", next: "Use at least 8 characters.", confirm: "The passwords do not match." },
    });
    expect(validatePasswordChange({ ...ok, next: "old-password", confirm: "old-password" })).toMatchObject({
      ok: false,
      errors: { next: "Choose a password different from your current one." },
    });
    expect(validatePasswordChange({ ...ok, next: "x".repeat(73), confirm: "x".repeat(73) })).toMatchObject({ ok: false, errors: { next: expect.stringContaining("at most 72") } });
  });
});

describe("avatarPathFromUrl", () => {
  it("extracts the object path from a public URL", () => {
    expect(avatarPathFromUrl("https://x.supabase.co/storage/v1/object/public/avatars/u1/a%20b.png")).toBe("u1/a b.png");
    expect(avatarPathFromUrl("https://elsewhere.example.com/a.png")).toBeNull();
    expect(avatarPathFromUrl(null)).toBeNull();
  });
});
