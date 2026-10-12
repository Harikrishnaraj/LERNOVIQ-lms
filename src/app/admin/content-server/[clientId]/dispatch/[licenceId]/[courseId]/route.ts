import { NextResponse } from "next/server";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { dispatchContentOrigin, signDispatchId } from "@/services/content-server";
import { buildDispatchPackage, packageFileName } from "@/services/content-server/package";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (body: string, status: number) =>
  new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/**
 * T-172 (F-521): downloads the SCORM 1.2 dispatch package for one licensed course, creating the
 * course's dispatch on first download. Managers only (RLS + permission check); audited.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string; licenceId: string; courseId: string }> },
) {
  const { clientId, licenceId, courseId } = await params;
  if (![clientId, licenceId, courseId].every((id) => UUID.test(id))) return text("Not found", 404);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return text("Please log in again.", 401);
  if (!(await can(supabase, user.id, "content_server.manage")))
    return text("You do not have permission to manage the content server.", 403);

  const contentOrigin = dispatchContentOrigin();
  if (!contentOrigin)
    return text(
      "Packages need a separate content address (NEXT_PUBLIC_SCORM_CONTENT_ORIGIN).",
      409,
    );

  const { data: licence } = await supabase
    .from("content_licences")
    .select("id")
    .eq("id", licenceId)
    .eq("client_id", clientId)
    .maybeSingle();
  const { data: link } = await supabase
    .from("content_licence_courses")
    .select("course_id")
    .eq("licence_id", licenceId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!licence || !link) return text("That course is not on this licence.", 404);

  const { data: dispatchable } = await supabase.rpc("content_course_is_dispatchable", {
    p_course_id: courseId,
  });
  if (dispatchable !== true)
    return text(
      "This course no longer has a published SCORM 1.2 lesson, so it cannot be packaged.",
      409,
    );

  let { data: dispatch } = await supabase
    .from("content_dispatches")
    .select("id, public_id")
    .eq("licence_id", licenceId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!dispatch) {
    const { data: created, error } = await supabase
      .from("content_dispatches")
      .insert({ licence_id: licenceId, course_id: courseId, created_by: user.id })
      .select("id, public_id")
      .single();
    if (error || !created) {
      // A parallel first download may have created it.
      ({ data: dispatch } = await supabase
        .from("content_dispatches")
        .select("id, public_id")
        .eq("licence_id", licenceId)
        .eq("course_id", courseId)
        .maybeSingle());
      if (!dispatch) return text("We could not create the package. Please try again.", 500);
    } else {
      dispatch = created;
    }
  }

  const { data: course } = await supabase
    .from("courses")
    .select("slug, published_version_id")
    .eq("id", courseId)
    .maybeSingle();
  const { data: version } = course?.published_version_id
    ? await supabase
        .from("course_versions")
        .select("title")
        .eq("id", course.published_version_id)
        .maybeSingle()
    : { data: null };
  const courseTitle =
    (version?.title as string | undefined) ?? (course?.slug as string | undefined) ?? "Course";

  const publicId = dispatch.public_id as string;
  const zip = await buildDispatchPackage({
    publicId,
    signature: signDispatchId(publicId),
    contentOrigin,
    courseTitle,
  });

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "content_dispatch.downloaded",
    resourceType: "content_dispatch",
    resourceId: dispatch.id as string,
    metadata: { client_id: clientId, licence_id: licenceId, course_id: courseId },
  });

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${packageFileName(courseTitle)}"`,
      "cache-control": "no-store",
    },
  });
}
