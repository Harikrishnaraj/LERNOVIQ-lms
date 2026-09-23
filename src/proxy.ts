import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { can } from "@/lib/permissions/can";
import { needsMfa } from "@/lib/permissions/mfa";

// Authentication ("is there a user") + portal-level authorization ("can this
// user use this portal"). Finer-grained per-action permission checks inside
// a portal are added as those features land.
const PORTAL_PERMISSION: Record<string, string> = {
  "/learner": "portal.learner.access",
  "/instructor": "portal.instructor.access",
  "/admin": "portal.admin.access",
};

export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const portal = Object.keys(PORTAL_PERMISSION).find((prefix) => pathname.startsWith(prefix));

  if (portal && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (portal && user) {
    const allowed = await can(supabase, user.id, PORTAL_PERMISSION[portal]);
    if (!allowed) {
      return NextResponse.redirect(new URL("/permission-denied", request.url));
    }
    // Admin console requires a second factor (F-005): send to enrol/challenge.
    if (portal === "/admin" && (await needsMfa(supabase))) {
      const url = new URL("/mfa", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/learner/:path*", "/instructor/:path*", "/admin/:path*", "/courses/:path*"],
};
