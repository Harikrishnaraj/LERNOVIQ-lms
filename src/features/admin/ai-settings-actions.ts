"use server";

import { revalidatePath } from "next/cache";
import { getAiSettings, toAiSettingsRow } from "@/features/ai/settings";
import { changedAiSettings, validateAiSettingsInput } from "@/features/ai/settings-rules";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

// AI Tutor settings (T-204, F-704, ADR-045): the kill switch, model and safety limits on /admin/ai.
// The write runs on the admin's own session, so the ai_settings RLS policy (ai.manage_settings)
// guards it as well as the check below. Every change is audited with the values before and after.

export type AiSettingsResult = { ok: true } | { ok: false; error: string };

export async function updateAiSettings(input: unknown): Promise<AiSettingsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "ai.manage_settings"))) {
    return { ok: false, error: "You do not have permission to change AI settings." };
  }

  const parsed = validateAiSettingsInput(input);
  if (!parsed.ok) return parsed;

  const before = await getAiSettings(supabase);
  if (!before) return { ok: false, error: "We could not load the AI settings. Please try again." };
  const after = { ...before, ...parsed.value };
  const changed = changedAiSettings(before, after);
  if (changed.length === 0) return { ok: true };

  const { data, error } = await supabase
    .from("ai_settings")
    .update({ ...toAiSettingsRow(parsed.value), updated_by: user.id })
    .eq("id", true)
    .select("tutor_enabled");
  if (error || !data || data.length === 0) {
    return { ok: false, error: "We could not save the AI settings. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "ai.settings_updated",
    resourceType: "ai_settings",
    metadata: { changed, before, after },
  });
  revalidatePath("/admin/ai");
  return { ok: true };
}
