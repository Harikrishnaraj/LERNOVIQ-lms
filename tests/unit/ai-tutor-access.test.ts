// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// T-206 (ADR-043): only admins with ai.manage_access can turn a user's AI Tutor on or off; every
// change is audited; the tutor's gate fails closed.

const { state, canMock, auditMock, upsertMock, deleteEqMock } = vi.hoisted(() => ({
  state: {
    user: { id: "admin-1", email: "admin@example.com" } as { id: string; email: string } | null,
    targetExists: true,
  },
  canMock: vi.fn(),
  auditMock: vi.fn(),
  upsertMock: vi.fn(),
  deleteEqMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/permissions/can", () => ({ can: canMock }));
vi.mock("@/services/audit", () => ({ recordAudit: auditMock }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }),
}));
vi.mock("@/services/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) =>
      table === "profiles"
        ? {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: state.targetExists ? { id: "u" } : null }),
              }),
            }),
          }
        : { upsert: upsertMock, delete: () => ({ eq: deleteEqMock }) },
  }),
}));

import { setAiTutorAccess } from "@/features/admin/ai-access-actions";
import { hasTutorAccess } from "@/features/ai/policy";

const TARGET = "11111111-2222-4333-8444-555555555555";

describe("setAiTutorAccess", () => {
  beforeEach(() => {
    state.user = { id: "admin-1", email: "admin@example.com" };
    state.targetExists = true;
    canMock.mockReset().mockResolvedValue(true);
    auditMock.mockReset().mockResolvedValue(true);
    upsertMock.mockReset().mockResolvedValue({ error: null });
    deleteEqMock.mockReset().mockResolvedValue({ error: null });
  });

  it("turns the tutor on for a user and audits it", async () => {
    expect(await setAiTutorAccess(TARGET, true)).toEqual({ ok: true });
    expect(canMock).toHaveBeenCalledWith(expect.anything(), "admin-1", "ai.manage_access");
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: TARGET, granted_by: "admin-1" }),
      { onConflict: "user_id" },
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ai.tutor_access_granted",
        resourceType: "user",
        resourceId: TARGET,
        actorId: "admin-1",
      }),
    );
  });

  it("turns the tutor off by removing the grant and audits it", async () => {
    expect(await setAiTutorAccess(TARGET, false)).toEqual({ ok: true });
    expect(deleteEqMock).toHaveBeenCalledWith("user_id", TARGET);
    expect(upsertMock).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ai.tutor_access_revoked" }),
    );
  });

  it("refuses signed-out callers and users without ai.manage_access", async () => {
    state.user = null;
    expect(await setAiTutorAccess(TARGET, true)).toMatchObject({
      ok: false,
      error: "Please log in again.",
    });
    state.user = { id: "learner-1", email: "l@example.com" };
    canMock.mockResolvedValue(false);
    expect(await setAiTutorAccess(TARGET, true)).toMatchObject({
      ok: false,
      error: expect.stringContaining("permission"),
    });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("rejects malformed input and unknown users", async () => {
    expect(await setAiTutorAccess("not-a-uuid", true)).toMatchObject({ ok: false });
    expect(await setAiTutorAccess(TARGET, "yes" as unknown as boolean)).toMatchObject({
      ok: false,
    });
    state.targetExists = false;
    expect(await setAiTutorAccess(TARGET, true)).toMatchObject({
      ok: false,
      error: "User not found.",
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("does not audit a change that failed to save", async () => {
    upsertMock.mockResolvedValue({ error: { message: "db down" } });
    expect(await setAiTutorAccess(TARGET, true)).toMatchObject({ ok: false });
    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("hasTutorAccess", () => {
  const client = (result: { data: unknown; error: unknown }) =>
    ({ rpc: vi.fn(async () => result) }) as unknown as SupabaseClient;

  it("is true only when the database says the caller is enabled", async () => {
    expect(await hasTutorAccess(client({ data: true, error: null }))).toBe(true);
    expect(await hasTutorAccess(client({ data: false, error: null }))).toBe(false);
  });

  it("fails closed when the check errors", async () => {
    expect(await hasTutorAccess(client({ data: null, error: { message: "down" } }))).toBe(false);
  });
});
