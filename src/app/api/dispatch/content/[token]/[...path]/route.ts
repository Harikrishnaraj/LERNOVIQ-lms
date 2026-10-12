import { NextResponse, type NextRequest } from "next/server";
import { dispatchContentOrigin, dispatchCsp, verifyDispatchToken } from "@/services/content-server";
import { DISPATCH_CHILD_SHIM } from "@/services/content-server/launch";
import { contentTypeFor } from "@/services/scorm/parse";
import { injectShim } from "@/services/scorm/shim";
import { SCORM_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";

const NOT_FOUND = () =>
  new NextResponse("Not found", { status: 404, headers: { "referrer-policy": "no-referrer" } });

/**
 * T-174 (F-522): one file of a dispatched SCORM package, /api/dispatch/content/<token>/<path>.
 * The token is bound to one registration and lesson; the registration's licence is re-checked on
 * every request, so revoking or expiring it stops content at once. Framing is limited to the
 * licence's LMS origins plus this content origin (the host frame).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; path: string[] }> },
) {
  const contentOrigin = dispatchContentOrigin();
  if (!contentOrigin || request.headers.get("host") !== new URL(contentOrigin).host)
    return NOT_FOUND();

  const { token, path: segments } = await params;
  const claims = verifyDispatchToken(token);
  if (!claims || segments.length === 0) return NOT_FOUND();
  const requestedPath = segments.join("/");

  const admin = createAdminClient();
  const [{ data: state }, { data: pkg }] = await Promise.all([
    admin.rpc("content_registration_active", { p_registration_id: claims.registrationId }),
    admin
      .from("scorm_packages")
      .select("storage_prefix, file_paths")
      .eq("lesson_id", claims.lessonId)
      .maybeSingle(),
  ]);
  const active = state as { active: boolean; allowed_origins: string[] } | null;
  if (!active?.active) {
    return new NextResponse("Access to this course has been switched off.", {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  }
  if (!pkg || !((pkg.file_paths as string[]) ?? []).includes(requestedPath)) return NOT_FOUND();

  let file: { bytes: Uint8Array; contentType: string };
  try {
    file = await supabaseStorage.download(
      SCORM_BUCKET,
      `${pkg.storage_prefix as string}/${requestedPath}`,
    );
  } catch {
    return NOT_FOUND();
  }
  const contentType = contentTypeFor(requestedPath) ?? file.contentType;
  const headers = {
    "content-type": contentType,
    "content-security-policy": dispatchCsp(active.allowed_origins ?? []),
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
  };
  if (contentType.includes("html")) {
    return new NextResponse(injectShim(new TextDecoder().decode(file.bytes), DISPATCH_CHILD_SHIM), {
      headers: { ...headers, "cache-control": "no-store" },
    });
  }
  return new NextResponse(Buffer.from(file.bytes), {
    headers: { ...headers, "cache-control": "private, max-age=3600" },
  });
}
