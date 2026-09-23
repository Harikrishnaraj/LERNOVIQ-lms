import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { can } from "@/lib/permissions/can";

function fakeSupabase(roleIds: string[], grantedPermissionIds: string[]): SupabaseClient {
  return {
    from: (table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: async () => ({ data: roleIds.map((role_id) => ({ role_id })) }),
          }),
        };
      }
      // role_permissions: .select().in(role_id).eq(permission_id, x)
      return {
        select: () => ({
          in: () => ({
            eq: async (_col: string, permissionId: string) => ({
              data: grantedPermissionIds.includes(permissionId)
                ? [{ permission_id: permissionId }]
                : [],
            }),
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
}

describe("can", () => {
  it("returns false when the user has no roles", async () => {
    expect(await can(fakeSupabase([], []), "u1", "portal.admin.access")).toBe(false);
  });

  it("returns false when the user's role doesn't grant the permission", async () => {
    expect(await can(fakeSupabase(["learner"], []), "u1", "portal.admin.access")).toBe(false);
  });

  it("returns true when one of the user's roles grants the permission", async () => {
    expect(
      await can(
        fakeSupabase(["learner", "instructor"], ["portal.instructor.access"]),
        "u1",
        "portal.instructor.access",
      ),
    ).toBe(true);
  });
});
