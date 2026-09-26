import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { can } from "@/lib/permissions/can";
import { needsMfa } from "@/lib/permissions/mfa";
import { getPlatformSettings } from "@/services/settings";
import { isSessionIdleExpired, LAST_ACTIVE_COOKIE } from "@/lib/permissions/session";

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

    const settings = await getPlatformSettings(supabase);

    // T-143: idle-session timeout, enforced before the MFA check so an expired session is never
    // waved into /mfa instead of /login.
    if (isSessionIdleExpired(request.cookies.get(LAST_ACTIVE_COOKIE)?.value, settings.sessionIdleTimeoutMinutes)) {
      await supabase.auth.signOut();
      const url = new URL("/login", request.url);
      url.searchParams.set("reason", "session-expired");
      const expired = NextResponse.redirect(url);
      expired.cookies.delete(LAST_ACTIVE_COOKIE);
      return expired;
    }
    if (settings.sessionIdleTimeoutMinutes !== null) {
      response.cookies.set(LAST_ACTIVE_COOKIE, new Date().toISOString(), { httpOnly: true, sameSite: "lax", path: "/" });
    }

    // Which portals require a second factor is configurable (F-005/T-143); defaults to exactly
    // "admin" so nothing changes for an operator who has never touched the setting.
    const portalName = portal.slice(1);
    if (settings.mfaRequiredPortals.includes(portalName) && (await needsMfa(supabase))) {
      const url = new URL("/mfa", request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/learner/:path*", "/instructor/:path*", "/admin/:path*", "/courses/:path*", "/certificates/:path*"],
};
