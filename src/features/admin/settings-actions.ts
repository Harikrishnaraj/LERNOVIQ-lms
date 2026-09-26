"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/can";
import { recordAudit } from "@/services/audit";
import { validatePlatformSettingsInput } from "./platform-settings";

export type PlatformSettingsActionResult = { ok: true } | { ok: false; error: string };

export async function updatePlatformSettingsAction(input: {
  minPasswordLength: unknown;
  mfaRequiredPortals: unknown;
  sessionIdleTimeoutMinutes: unknown;
}): Promise<PlatformSettingsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "settings.manage"))) return { ok: false, error: "You do not have permission to change platform settings." };

  const parsed = validatePlatformSettingsInput(input);
  if (!parsed.ok) return parsed;

  const { error } = await supabase
    .from("platform_settings")
    .update({
      min_password_length: parsed.value.minPasswordLength,
      mfa_required_portals: parsed.value.mfaRequiredPortals,
      session_idle_timeout_minutes: parsed.value.sessionIdleTimeoutMinutes,
      updated_by: user.id,
    })
    .eq("id", true);
  if (error) return { ok: false, error: "We could not save those settings. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "settings.changed",
    resourceType: "platform_settings",
    resourceId: null,
    metadata: { ...parsed.value },
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}
