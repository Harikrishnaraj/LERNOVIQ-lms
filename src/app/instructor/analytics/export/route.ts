import { NextResponse, type NextRequest } from "next/server";
import {
  exportToCsv,
  getInstructorExportRows,
  parseAnalyticsRange,
  parseCourseFilter,
} from "@/features/instructor/analytics";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit } from "@/services/rate-limit";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!(await rateLimit("analytics-export", await clientIp(), user.id))) {
    return new NextResponse("Too many exports. Please wait a while and try again.", { status: 429 });
  }

  const courseParam = request.nextUrl.searchParams.get("course");
  const courseId = parseCourseFilter(courseParam);
  const range = parseAnalyticsRange(request.nextUrl.searchParams.get("range") ?? undefined);

  try {
    const rows = await getInstructorExportRows(supabase, range, courseId);
    const csvData = exportToCsv(rows);
    // Learner roster leaving the platform (report audit C21). recordAudit never throws, so a failed
    // audit write does not block the download.
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "instructor.analytics_exported",
      resourceType: "course",
      resourceId: courseId,
      metadata: { courseId: courseId ?? "all", rangeDays: range, exported: rows.length },
    });
    const today = new Date().toISOString().slice(0, 10);
    const filename = courseId
      ? `analytics-course-${courseId}-last-${range}-days-${today}.csv`
      : `analytics-all-courses-last-${range}-days-${today}.csv`;

    return new NextResponse(csvData, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // The detail goes to the server log only; the response stays generic (SECURITY, GAP-126).
    log.error("instructor_analytics.export_failed", { message: err instanceof Error ? err.message : String(err) });
    return new NextResponse("We could not export your analytics. Please try again.", { status: 500 });
  }
}
