import { describe, expect, it } from "vitest";
import { validatePlatformSettingsInput } from "@/features/admin/platform-settings";

const base = { minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null };

describe("validatePlatformSettingsInput", () => {
  it("accepts valid input, coercing string numbers from a form", () => {
    const result = validatePlatformSettingsInput({ minPasswordLength: "10", mfaRequiredPortals: ["admin", "learner"], sessionIdleTimeoutMinutes: "45" });
    expect(result).toEqual({ ok: true, value: { minPasswordLength: 10, mfaRequiredPortals: ["admin", "learner"], sessionIdleTimeoutMinutes: 45 } });
  });

  it("treats an empty idle timeout as off", () => {
    const result = validatePlatformSettingsInput({ ...base, sessionIdleTimeoutMinutes: "" });
    expect(result).toEqual({ ok: true, value: { minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null } });
  });

  it("rejects a password minimum outside 8-128", () => {
    expect(validatePlatformSettingsInput({ ...base, minPasswordLength: 7 }).ok).toBe(false);
    expect(validatePlatformSettingsInput({ ...base, minPasswordLength: 129 }).ok).toBe(false);
    expect(validatePlatformSettingsInput({ ...base, minPasswordLength: "not-a-number" }).ok).toBe(false);
  });

  it("rejects an unknown portal", () => {
    expect(validatePlatformSettingsInput({ ...base, mfaRequiredPortals: ["admin", "not-a-portal"] }).ok).toBe(false);
  });

  it("rejects an idle timeout outside 5-10080", () => {
    expect(validatePlatformSettingsInput({ ...base, sessionIdleTimeoutMinutes: 4 }).ok).toBe(false);
    expect(validatePlatformSettingsInput({ ...base, sessionIdleTimeoutMinutes: 10081 }).ok).toBe(false);
  });

  it("deduplicates the MFA portal list", () => {
    const result = validatePlatformSettingsInput({ ...base, mfaRequiredPortals: ["admin", "admin"] });
    expect(result).toEqual({ ok: true, value: { minPasswordLength: 8, mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null } });
  });
});
