import { NextResponse, type NextRequest } from "next/server";
import { removeOrphanedStorage } from "@/features/privacy/storage-cleanup";
import { supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";

/** Daily removal of uploaded files left by deleted accounts and assignments (T-294, T-300). `CRON_SECRET` only. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    return NextResponse.json(await removeOrphanedStorage(createAdminClient(), supabaseStorage));
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : "Cleanup failed", { status: 500 });
  }
}
