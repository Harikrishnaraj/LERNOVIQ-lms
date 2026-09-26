import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { can } from "@/lib/permissions/can";
import { needsMfa } from "@/lib/permissions/mfa";
import { LAST_ACTIVE_COOKIE, isSessionIdleExpired } from "@/lib/permissions/session";
import { getPlatformSettings } from "@/services/settings";

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

    // Platform policy (T-143): configurable which portals require a second factor, and whether
    // an idle session forces re-authentication. Defaults match the app's original hardcoded
    // behavior (admin-only MFA, no idle timeout) until an admin changes them.
    const settings = await getPlatformSettings(supabase);
    const portalName = portal.slice(1);

    if (settings.sessionIdleTimeoutMinutes !== null) {
      const lastActive = request.cookies.get(LAST_ACTIVE_COOKIE)?.value ?? null;
      if (isSessionIdleExpired(lastActive, settings.sessionIdleTimeoutMinutes, new Date())) {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("next", pathname);
        url.searchParams.set("reason", "session-expired");
        const redirect = NextResponse.redirect(url);
        redirect.cookies.delete(LAST_ACTIVE_COOKIE);
        return redirect;
      }
      response.cookies.set(LAST_ACTIVE_COOKIE, new Date().toISOString(), {
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      });
    }

    // Second factor required for this portal (F-005 originally hardcoded to admin only).
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
