import { beforeEach, describe, expect, it, vi } from "vitest";
import { logout } from "@/features/auth/logout";

const { redirectMock, signOutMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  signOutMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { signOut: signOutMock } })),
}));

describe("logout server action", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    signOutMock.mockReset();
  });

  it("signs the user out and redirects to /login", async () => {
    signOutMock.mockResolvedValue({ error: null });
    await expect(logout()).rejects.toThrow("REDIRECT:/login");
    expect(signOutMock).toHaveBeenCalled();
  });
});
