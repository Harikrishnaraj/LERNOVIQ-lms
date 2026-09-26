import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";

const { updateSessionMock, canMock, getPlatformSettingsMock } = vi.hoisted(() => ({
  updateSessionMock: vi.fn(),
  canMock: vi.fn(),
  getPlatformSettingsMock: vi.fn(),
}));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionMock }));
vi.mock("@/lib/permissions/can", () => ({ can: canMock }));
vi.mock("@/services/settings", () => ({ getPlatformSettings: getPlatformSettingsMock }));

function makeRequest(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "http://localhost:3000"));
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

describe("proxy", () => {
  beforeEach(() => {
    updateSessionMock.mockReset();
    canMock.mockReset();
    getPlatformSettingsMock.mockReset();
    // Matches this app's original hardcoded behavior before settings became configurable.
    getPlatformSettingsMock.mockResolvedValue({ mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: null });
  });

  it("passes through a protected route when the user has portal access", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      response: passThrough,
      user: { id: "u1" },
      supabase: {},
    });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/learner"));
    expect(result).toBe(passThrough);
    expect(canMock).toHaveBeenCalledWith({}, "u1", "portal.learner.access");
  });

  it("redirects to /login?next=... when there is no user on a protected route", async () => {
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: null,
      supabase: {},
    });
    const result = await proxy(makeRequest("/instructor/courses"));
    expect(result.status).toBe(307);
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/instructor/courses");
    expect(canMock).not.toHaveBeenCalled();
  });

  it("redirects to /permission-denied when the user lacks the portal's permission", async () => {
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase: {},
    });
    canMock.mockResolvedValue(false);
    const result = await proxy(makeRequest("/admin"));
    expect(result.status).toBe(307);
    expect(new URL(result.headers.get("location")!).pathname).toBe("/permission-denied");
  });

  it("redirects /admin to /mfa when the session is not AAL2", async () => {
    const supabase = {
      auth: {
        mfa: {
          getAuthenticatorAssuranceLevel: vi
            .fn()
            .mockResolvedValue({ data: { currentLevel: "aal1" }, error: null }),
        },
      },
    };
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase,
    });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/admin/users"));
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/mfa");
    expect(location.searchParams.get("next")).toBe("/admin/users");
  });

  it("lets an AAL2 admin through", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      response: passThrough,
      user: { id: "u1" },
      supabase: {
        auth: {
          mfa: {
            getAuthenticatorAssuranceLevel: vi
              .fn()
              .mockResolvedValue({ data: { currentLevel: "aal2" }, error: null }),
          },
        },
      },
    });
    canMock.mockResolvedValue(true);
    expect(await proxy(makeRequest("/admin"))).toBe(passThrough);
  });

  it("does not gate an unprotected route", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({ response: passThrough, user: null, supabase: {} });
    const result = await proxy(makeRequest("/signup"));
    expect(result).toBe(passThrough);
  });

  // T-143: which portals require MFA is configurable.
  it("does not require MFA on /admin once it is removed from the configured list", async () => {
    getPlatformSettingsMock.mockResolvedValue({ mfaRequiredPortals: [], sessionIdleTimeoutMinutes: null });
    const passThrough = NextResponse.next();
    const mfaCheck = vi.fn().mockResolvedValue({ data: { currentLevel: "aal1" }, error: null });
    updateSessionMock.mockResolvedValue({
      response: passThrough,
      user: { id: "u1" },
      supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: mfaCheck } } },
    });
    canMock.mockResolvedValue(true);
    expect(await proxy(makeRequest("/admin"))).toBe(passThrough);
  });

  it("requires MFA on a non-admin portal once it is added to the configured list", async () => {
    getPlatformSettingsMock.mockResolvedValue({ mfaRequiredPortals: ["learner"], sessionIdleTimeoutMinutes: null });
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase: { auth: { mfa: { getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({ data: { currentLevel: "aal1" }, error: null }) } } },
    });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/learner"));
    expect(new URL(result.headers.get("location")!).pathname).toBe("/mfa");
  });

  // T-143: idle-session timeout.
  it("signs out and redirects to /login when the idle timeout has elapsed", async () => {
    getPlatformSettingsMock.mockResolvedValue({ mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: 30 });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase: { auth: { signOut } },
    });
    canMock.mockResolvedValue(true);
    const staleTimestamp = new Date(Date.now() - 60 * 60_000).toISOString();
    const result = await proxy(makeRequest("/learner", { lms_last_active: staleTimestamp }));
    expect(signOut).toHaveBeenCalled();
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("reason")).toBe("session-expired");
  });

  it("fails closed (signs out) when a timeout is configured but the activity cookie is missing", async () => {
    getPlatformSettingsMock.mockResolvedValue({ mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: 30 });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    updateSessionMock.mockResolvedValue({
      response: NextResponse.next(),
      user: { id: "u1" },
      supabase: { auth: { signOut } },
    });
    canMock.mockResolvedValue(true);
    const result = await proxy(makeRequest("/learner"));
    expect(signOut).toHaveBeenCalled();
    expect(new URL(result.headers.get("location")!).pathname).toBe("/login");
  });

  it("refreshes the activity cookie and lets a fresh session through when a timeout is configured", async () => {
    getPlatformSettingsMock.mockResolvedValue({ mfaRequiredPortals: ["admin"], sessionIdleTimeoutMinutes: 30 });
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({
      response: passThrough,
      user: { id: "u1" },
      supabase: {},
    });
    canMock.mockResolvedValue(true);
    const freshTimestamp = new Date().toISOString();
    const result = await proxy(makeRequest("/learner", { lms_last_active: freshTimestamp }));
    expect(result).toBe(passThrough);
    expect(result.cookies.get("lms_last_active")?.value).toBeTruthy();
  });
});
