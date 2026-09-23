import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the code from a Supabase email link (signup verification or
// password recovery) for a session. `next` picks the destination on success
// — defaults to home; role-aware redirect lands in T-018.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const errorRedirect = next === "/reset-password" ? "/forgot-password" : "/verify-email";
  return NextResponse.redirect(`${origin}${errorRedirect}?error=link_invalid`);
}
