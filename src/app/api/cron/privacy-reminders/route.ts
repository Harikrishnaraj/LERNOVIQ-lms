import { NextResponse, type NextRequest } from "next/server";
import { sendRequestReminders } from "@/features/privacy/request-reminders";
import { notify } from "@/services/notifications";
import { createAdminClient } from "@/services/supabase/admin";

/** Reminds privacy staff of requests near or past their one-month deadline (T-297). `CRON_SECRET` only. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    return NextResponse.json(
      await sendRequestReminders(createAdminClient(), (n) => notify({ ...n, category: "system" })),
    );
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Reminders failed", { status: 500 });
  }
}
