import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeOnboarding } from "@/features/onboarding/complete-onboarding";
import { onboardingSchema } from "@/features/onboarding/schemas";

const { redirectMock, upsertMock, getUserMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  upsertMock: vi.fn(),
  getUserMock: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
    from: vi.fn(() => ({ upsert: upsertMock })),
  })),
}));

describe("onboardingSchema", () => {
  it("requires at least one interest", () => {
    expect(onboardingSchema.safeParse({ interests: [], goals: [] }).success).toBe(false);
  });
  it("rejects unknown values", () => {
    expect(onboardingSchema.safeParse({ interests: ["nope"], goals: [] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ interests: ["design"], goals: ["nope"] }).success).toBe(
      false,
    );
  });
  it("accepts interests with optional goals", () => {
    expect(onboardingSchema.safeParse({ interests: ["design"], goals: [] }).success).toBe(true);
  });
});

describe("completeOnboarding", () => {
  beforeEach(() => {
    upsertMock.mockReset();
    getUserMock.mockReset();
  });

  it("rejects invalid input without touching the database", async () => {
    const result = await completeOnboarding({ interests: [], goals: [] });
    expect(result).toEqual({ error: "Pick at least one interest." });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const result = await completeOnboarding({ interests: ["design"], goals: [] });
    expect(result).toEqual({ error: "Please log in again." });
  });

  it("saves the caller own row and continues to /learner", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    upsertMock.mockResolvedValue({ error: null });
    await expect(completeOnboarding({ interests: ["design"], goals: ["hobby"] })).rejects.toThrow(
      "REDIRECT:/learner",
    );
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", interests: ["design"], goals: ["hobby"] }),
    );
  });

  it("returns a safe error when the write fails", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    upsertMock.mockResolvedValue({ error: { message: "db down" } });
    const result = await completeOnboarding({ interests: ["design"], goals: [] });
    expect(result).toEqual({ error: "We could not save your choices. Please try again." });
  });
});
