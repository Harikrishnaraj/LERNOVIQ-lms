import type { SupabaseClient } from "@supabase/supabase-js";

export interface PlatformSettings {
  minPasswordLength: number;
  mfaRequiredPortals: string[];
  sessionIdleTimeoutMinutes: number | null;
}

const DEFAULTS: PlatformSettings = {
  minPasswordLength: 8,
  mfaRequiredPortals: ["admin"],
  sessionIdleTimeoutMinutes: null,
};

interface Row {
  min_password_length: number;
  mfa_required_portals: string[];
  session_idle_timeout_minutes: number | null;
}

/**
 * The single configurable row of password/MFA/session policy (T-143). Publicly readable (even
 * signed out: signup/reset need the password-length floor before the caller has a session), so
 * this never throws on a missing row — it falls back to the defaults every hardcoded check used
 * before this table existed, so a read failure can never loosen policy.
 */
export async function getPlatformSettings(supabase: SupabaseClient): Promise<PlatformSettings> {
  const { data } = await supabase.from("platform_settings").select("min_password_length, mfa_required_portals, session_idle_timeout_minutes").eq("id", true).maybeSingle();
  if (!data) return DEFAULTS;
  const row = data as Row;
  return {
    minPasswordLength: row.min_password_length,
    mfaRequiredPortals: row.mfa_required_portals,
    sessionIdleTimeoutMinutes: row.session_idle_timeout_minutes,
  };
}
