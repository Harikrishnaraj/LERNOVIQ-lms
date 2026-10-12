import { NextResponse } from "next/server";
import { getClientUsage, usageToCsv } from "@/features/content-server/queries";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit } from "@/services/rate-limit";
import { log } from "@/lib/log";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (body: string, status: number) =>
  new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });

/** T-176 (F-524): usage CSV for one content-server customer. Managers only; audited. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { clientId } = await params;
  if (!UUID.test(clientId)) return text("Not found", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return text("Please log in again.", 401);
  if (!(await can(supabase, user.id, "content_server.manage")))
    return text("You do not have permission to manage the content server.", 403);
  if (!(await rateLimit("analytics-export", await clientIp(), user.id)))
    return text("Too many exports. Please wait a while and try again.", 429);

  const { data: client } = await supabase
    .from("content_clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client) return text("Not found", 404);
  try {
    const csv = usageToCsv(client.name as string, await getClientUsage(supabase, clientId));
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "content_usage.exported",
      resourceType: "content_client",
      resourceId: clientId,
      metadata: {},
    });
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="content-server-usage-${new Date().toISOString().slice(0, 10)}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    log.error("content_server.usage_export_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return text("We could not export the usage report. Please try again.", 500);
  }
}
