import type { SupabaseClient } from "@supabase/supabase-js";

export async function can(
  supabase: SupabaseClient,
  userId: string,
  permission: string,
): Promise<boolean> {
  const { data: userRoles } = await supabase
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  const roleIds = (userRoles ?? []).map((row) => row.role_id as string);
  if (roleIds.length === 0) return false;

  const { data: grants } = await supabase
    .from("role_permissions")
    .select("permission_id")
    .in("role_id", roleIds)
    .eq("permission_id", permission);

  return (grants ?? []).length > 0;
}
