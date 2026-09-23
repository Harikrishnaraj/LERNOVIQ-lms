import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPortalPathForUser } from "@/features/auth/roles";

// Exchanges the code from a Supabase email link (signup verification or
// password recovery) for a session. An explicit `next` (password recovery)
// wins; otherwise (signup verification) redirect to the user's portal.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const target = next ?? (await getPortalPathForUser(supabase, data.user.id));
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  const errorRedirect = next === "/reset-password" ? "/forgot-password" : "/verify-email";
  return NextResponse.redirect(`${origin}${errorRedirect}?error=link_invalid`);
}
