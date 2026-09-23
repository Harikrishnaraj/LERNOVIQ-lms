import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Authentication gate only — "is there a user at all". Role/permission
// checks and the permission-denied page are T-019.
const PROTECTED_PREFIXES = ["/learner", "/instructor", "/admin"];

export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/learner/:path*", "/instructor/:path*", "/admin/:path*"],
};
