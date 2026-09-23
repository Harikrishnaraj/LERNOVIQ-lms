import { beforeEach, describe, expect, it, vi } from "vitest";
import { forgotPassword } from "@/features/auth/forgot-password";
import { rateLimit } from "@/services/rate-limit";

const { resetMock } = vi.hoisted(() => ({ resetMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { resetPasswordForEmail: resetMock } })),
}));

describe("forgotPassword server action", () => {
  beforeEach(() => resetMock.mockReset());

  it("rejects an invalid email without calling Supabase", async () => {
    const result = await forgotPassword({ email: "not-an-email" });
    expect(result).toEqual({ error: "Enter a valid email address." });
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("returns the same generic message whether or not Supabase actually sent anything", async () => {
    resetMock.mockResolvedValue({ error: null });
    const result = await forgotPassword({ email: "test@example.com" });
    expect(result).toEqual({
      message: "If that email has an account, we sent a password reset link.",
    });
  });

  it("surfaces a safe error when Supabase fails (e.g. rate limited)", async () => {
    resetMock.mockResolvedValue({ error: { message: "email rate limit exceeded" } });
    const result = await forgotPassword({ email: "test@example.com" });
    expect(result).toEqual({
      error: "We couldn't send the reset email. Please try again shortly.",
    });
  });

  it("is rate limited", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(false);
    const result = await forgotPassword({ email: "test@example.com" });
    expect(result).toEqual({ error: "Too many attempts. Please wait a while and try again." });
    expect(resetMock).not.toHaveBeenCalled();
  });
});
