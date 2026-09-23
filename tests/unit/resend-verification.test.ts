import { beforeEach, describe, expect, it, vi } from "vitest";
import { resendVerification } from "@/features/auth/resend-verification";
import { rateLimit } from "@/services/rate-limit";

const { resendMock } = vi.hoisted(() => ({ resendMock: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { resend: resendMock } })),
}));

describe("resendVerification server action", () => {
  beforeEach(() => resendMock.mockReset());

  it("rejects an invalid email without calling Supabase", async () => {
    const result = await resendVerification("not-an-email");
    expect(result).toEqual({ error: "Enter a valid email address." });
    expect(resendMock).not.toHaveBeenCalled();
  });

  it("returns a safe error message when Supabase fails", async () => {
    resendMock.mockResolvedValue({ error: { message: "rate limited" } });
    const result = await resendVerification("test@example.com");
    expect(result).toEqual({ error: "We couldn't resend the email. Please try again shortly." });
  });

  it("returns no error on success", async () => {
    resendMock.mockResolvedValue({ error: null });
    const result = await resendVerification("test@example.com");
    expect(result).toEqual({});
    expect(resendMock).toHaveBeenCalledWith({ type: "signup", email: "test@example.com" });
  });

  it("is rate limited", async () => {
    vi.mocked(rateLimit).mockResolvedValueOnce(false);
    const result = await resendVerification("test@example.com");
    expect(result).toEqual({ error: "Too many attempts. Please wait a while and try again." });
    expect(resendMock).not.toHaveBeenCalled();
  });
});
