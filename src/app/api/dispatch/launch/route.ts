import { NextResponse, type NextRequest } from "next/server";
import { buildHostFrame } from "@/services/scorm/host-frame";
import { buildScormShim } from "@/services/scorm/shim";
import {
  dispatchContentOrigin,
  dispatchCsp,
  learnerKey,
  signDispatchToken,
  verifyDispatchId,
} from "@/services/content-server";
import {
  dispatchSeedCmi,
  parseLaunchForm,
  refusalPage,
  REFUSALS,
  type RefusalReason,
} from "@/services/content-server/launch";
import { clientIp, rateLimit } from "@/services/rate-limit";
import { createAdminClient } from "@/services/supabase/admin";
import { log } from "@/lib/log";

const BASE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

function refuse(reason: RefusalReason) {
  return new NextResponse(refusalPage(reason), {
    status: REFUSALS[reason].status,
    headers: { ...BASE_HEADERS, "content-security-policy": dispatchCsp("any") },
  });
}

/**
 * T-173 (F-522, ADR-041, SECURITY §27): a dispatch package's launcher posts here from inside the
 * customer's LMS. Checks, in order: served on the content origin; well-formed post; rate limit;
 * dispatch signature; embedding origin in the licence's allowlist; then, atomically in the
 * database, licence not revoked/expired, course still dispatchable, seat limit. On success it
 * returns the course host frame seeded with the LMS's own saved progress.
 */
export async function POST(request: NextRequest) {
  const contentOrigin = dispatchContentOrigin();
  if (!contentOrigin || request.headers.get("host") !== new URL(contentOrigin).host) {
    return new NextResponse("Not found", { status: 404 });
  }

  const form = parseLaunchForm(await request.formData().catch(() => new FormData()));
  if (!form) return refuse("invalid");
  if (!(await rateLimit("content-launch", await clientIp(), form.dispatch)))
    return refuse("rate_limited");
  if (!verifyDispatchId(form.dispatch, form.signature)) return refuse("not_found");

  const admin = createAdminClient();
  const { data: dispatch } = await admin
    .from("content_dispatches")
    .select("licence_id")
    .eq("public_id", form.dispatch)
    .maybeSingle();
  if (!dispatch) return refuse("not_found");
  const { data: licence } = await admin
    .from("content_licences")
    .select("allowed_origins")
    .eq("id", dispatch.licence_id)
    .maybeSingle();
  if (!licence) return refuse("not_found");
  const allowedOrigins = (licence.allowed_origins as string[] | null) ?? [];
  const origin = (request.headers.get("origin") ?? "").toLowerCase();
  if (!origin || !allowedOrigins.includes(origin)) return refuse("not_allowed");

  const { data: result, error } = await admin.rpc("register_content_launch", {
    p_public_id: form.dispatch,
    p_learner_key: learnerKey(dispatch.licence_id as string, form.learnerId),
  });
  if (error || !result) {
    log.error("content_server.launch_failed", { message: error?.message ?? "no result" });
    return refuse("unavailable");
  }
  const outcome = result as { status: string; registration_id?: string; lesson_id?: string };
  if (outcome.status !== "ok" || !outcome.registration_id || !outcome.lesson_id) {
    return refuse((outcome.status in REFUSALS ? outcome.status : "unavailable") as RefusalReason);
  }

  const { data: pkg } = await admin
    .from("scorm_packages")
    .select("launch_path")
    .eq("lesson_id", outcome.lesson_id)
    .maybeSingle();
  if (!pkg) return refuse("unavailable");

  const token = signDispatchToken(outcome.registration_id, outcome.lesson_id);
  const html = buildHostFrame({
    shim: buildScormShim({ version: "1.2", seedCmi: dispatchSeedCmi(form) }),
    launchPath: pkg.launch_path as string,
    contentBase: `/api/dispatch/content/${token}/`,
  });
  return new NextResponse(html, {
    headers: { ...BASE_HEADERS, "content-security-policy": dispatchCsp(allowedOrigins) },
  });
}
