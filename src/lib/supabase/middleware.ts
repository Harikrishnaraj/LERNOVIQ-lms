import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { getSupabaseEnv } from "./env";

// Refreshes the auth session and syncs cookies onto the response. Call from
// the root proxy.ts. Returns the (possibly null) user so the caller can gate
// routes, and the client itself so a permission check (can(), T-019) can
// reuse it instead of creating a second one.
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; user: User | null; supabase: SupabaseClient }> {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
