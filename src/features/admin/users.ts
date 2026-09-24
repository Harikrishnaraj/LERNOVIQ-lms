import type { SupabaseClient } from "@supabase/supabase-js";
import { isRoleId, type RoleId } from "./user-rules";

export interface AdminUser {
  userId: string;
  email: string | null;
  fullName: string | null;
  status: "active" | "suspended";
  roles: string[];
  createdAt: string;
  lastSignInAt: string | null;
}

export const USERS_PAGE_SIZE = 25;

export interface UserQuery {
  q: string;
  role: RoleId | "";
  status: "active" | "suspended" | "";
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseUserQuery(params: Params): UserQuery {
  const role = one(params.role);
  const status = one(params.status);
  const page = Number.parseInt(one(params.page), 10);
  return {
    q: one(params.q).trim().slice(0, 100),
    role: isRoleId(role) ? role : "",
    status: status === "active" || status === "suspended" ? status : "",
    page: Number.isFinite(page) && page > 0 && page < 10_000 ? page : 1,
  };
}

interface Row {
  user_id: string;
  email: string | null;
  full_name: string | null;
  status: string;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  total: number | string;
}

/** One page of users (filtered and paged in the database). The RPC needs user.read_all. */
export async function getAdminUsers(supabase: SupabaseClient, query: UserQuery): Promise<{ users: AdminUser[]; total: number }> {
  const { data, error } = await supabase.rpc("admin_users", {
    p_q: query.q,
    p_role: query.role,
    p_status: query.status,
    p_limit: USERS_PAGE_SIZE,
    p_offset: (query.page - 1) * USERS_PAGE_SIZE,
  });
  if (error) throw new Error(`admin_users failed: ${error.message}`);
  const rows = (data ?? []) as Row[];
  return {
    total: rows.length > 0 ? Number(rows[0].total) : 0,
    users: rows.map((r) => ({
      userId: r.user_id,
      email: r.email,
      fullName: r.full_name,
      status: r.status === "suspended" ? "suspended" : "active",
      roles: r.roles,
      createdAt: r.created_at,
      lastSignInAt: r.last_sign_in_at,
    })),
  };
}
