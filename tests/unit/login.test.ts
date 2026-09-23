import { beforeEach, describe, expect, it, vi } from "vitest";
import { login } from "@/features/auth/login";

const { redirectMock, signInMock, signOutMock, singleMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  signInMock: vi.fn(),
  signOutMock: vi.fn(),
  singleMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithPassword: signInMock, signOut: signOutMock },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single: singleMock })) })) })),
  })),
}));

const validInput = { email: "test@example.com", password: "password1" };

describe("login server action", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    signInMock.mockReset();
    signOutMock.mockReset();
    singleMock.mockReset();
  });

  it("rejects invalid input server-side without calling Supabase", async () => {
    const result = await login({ email: "not-an-email", password: "" });
    expect(result).toEqual({ error: "Please check your details and try again." });
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("returns one generic error for wrong credentials, not revealing the cause", async () => {
    signInMock.mockResolvedValue({ data: {}, error: { message: "Invalid login credentials" } });
    const result = await login(validInput);
    expect(result).toEqual({ error: "Invalid email or password." });
  });

  it("signs a suspended user back out and reports suspension", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "suspended" } });
    const result = await login(validInput);
    expect(result).toEqual({ error: "Your account has been suspended. Contact support." });
    expect(signOutMock).toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects home for an active user", async () => {
    signInMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    singleMock.mockResolvedValue({ data: { status: "active" } });
    await expect(login(validInput)).rejects.toThrow("REDIRECT:/");
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
