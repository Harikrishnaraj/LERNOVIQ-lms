import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";

const { updateSessionMock, canMock } = vi.hoisted(() => ({
  updateSessionMock: vi.fn(),
  canMock: vi.fn(),
}));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionMock }));
vi.mock("@/lib/permissions/can", () => ({ can: canMock }));

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy", () => {
  beforeEach(() => {
    updateSessionMock.mockReset();
    canMock.mockReset();
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

  it("does not gate an unprotected route", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({ response: passThrough, user: null, supabase: {} });
    const result = await proxy(makeRequest("/signup"));
    expect(result).toBe(passThrough);
  });
});
