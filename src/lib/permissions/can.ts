import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Does `userId` (the signed-in user) hold `permission`? A suspended account holds none, so a
 * session that was open when the account was suspended stops working (the database function
 * has_permission applies the same rule to RLS).
 */
export async function can(
  supabase: SupabaseClient,
  userId: string,
  permission: string,
): Promise<boolean> {
  const [{ data: userRoles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role_id").eq("user_id", userId),
    supabase.from("profiles").select("status").eq("id", userId).maybeSingle(),
  ]);
  if (profile?.status === "suspended") return false;
  const roleIds = (userRoles ?? []).map((row) => row.role_id as string);
  if (roleIds.length === 0) return false;

  const { data: grants } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds)
    .eq("permission_id", permission);

  return (grants ?? []).length > 0;
}
