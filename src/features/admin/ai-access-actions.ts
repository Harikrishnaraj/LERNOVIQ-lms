"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { createAdminClient } from "@/services/supabase/admin";

// Per-user AI Tutor access (T-206, ADR-043): an admin turns the tutor on or off for one user.

export type AiAccessResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function setAiTutorAccess(userId: string, enabled: boolean): Promise<AiAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "ai.manage_access"))) {
    return { ok: false, error: "You do not have permission to manage AI access." };
  }
  if (typeof userId !== "string" || !UUID.test(userId) || typeof enabled !== "boolean") {
    return { ok: false, error: "User not found." };
  }

  const admin = createAdminClient();
  const { data: target } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!target) return { ok: false, error: "User not found." };

  const { error } = enabled
    ? await admin
        .from("ai_tutor_access")
        .upsert(
          { user_id: userId, granted_by: user.id, granted_at: new Date().toISOString() },
          { onConflict: "user_id" },
        )
    : await admin.from("ai_tutor_access").delete().eq("user_id", userId);
  if (error) return { ok: false, error: "We could not change AI access. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: enabled ? "ai.tutor_access_granted" : "ai.tutor_access_revoked",
    resourceType: "user",
    resourceId: userId,
  });
  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}
