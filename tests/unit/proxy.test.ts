import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { proxy } from "@/proxy";

const { updateSessionMock } = vi.hoisted(() => ({ updateSessionMock: vi.fn() }));
vi.mock("@/lib/supabase/middleware", () => ({ updateSession: updateSessionMock }));

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("proxy", () => {
  beforeEach(() => updateSessionMock.mockReset());

  it("passes through a protected route when a user is present", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({ response: passThrough, user: { id: "u1" } });
    const result = await proxy(makeRequest("/learner"));
    expect(result).toBe(passThrough);
  });

  it("redirects to /login?next=... when there is no user on a protected route", async () => {
    updateSessionMock.mockResolvedValue({ response: NextResponse.next(), user: null });
    const result = await proxy(makeRequest("/instructor/courses"));
    expect(result.status).toBe(307);
    const location = new URL(result.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/instructor/courses");
  });

  it("does not gate an unprotected route", async () => {
    const passThrough = NextResponse.next();
    updateSessionMock.mockResolvedValue({ response: passThrough, user: null });
    const result = await proxy(makeRequest("/signup"));
    expect(result).toBe(passThrough);
  });
});
