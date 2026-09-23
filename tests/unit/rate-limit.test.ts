import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/services/rate-limit");
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: rpcMock }) }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }),
}));

import { clientIp, rateLimit } from "@/services/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
  });

  it("allows when every identifier is under its limit", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    expect(await rateLimit("login", "1.1.1.1", "A@B.com")).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "login:ip:1.1.1.1",
      p_limit: 100,
      p_window_seconds: 900,
    });
    expect(rpcMock).toHaveBeenCalledWith("check_rate_limit", {
      p_key: "login:a@b.com",
      p_limit: 10,
      p_window_seconds: 900,
    });
  });

  it("blocks as soon as one identifier is over its limit", async () => {
    rpcMock.mockResolvedValueOnce({ data: true, error: null });
    rpcMock.mockResolvedValueOnce({ data: false, error: null });
    expect(await rateLimit("login", "1.1.1.1", "a@b.com")).toBe(false);
  });

  it("fails open when the limiter errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await rateLimit("password-reset", "x")).toBe(true);
  });

  it("takes the first X-Forwarded-For hop as the client IP", async () => {
    expect(await clientIp()).toBe("9.9.9.9");
  });
});
