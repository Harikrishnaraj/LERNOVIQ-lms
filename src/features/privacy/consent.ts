import type { SupabaseClient } from "@supabase/supabase-js";
import { CONSENT_PURPOSES, POLICY_VERSION, type ConsentPurpose } from "./consent-purposes";

/** Store that consent was given: the wording, the policy version and the time, for one purpose. */
export async function recordConsent(
  admin: SupabaseClient,
  input: { purpose: ConsentPurpose; userId?: string; email?: string; sourceId?: string },
) {
  return admin.from("consent_records").insert({
    user_id: input.userId ?? null,
    subject_email: input.email?.toLowerCase() ?? null,
    purpose: input.purpose,
    purpose_text: CONSENT_PURPOSES[input.purpose].text,
    policy_version: POLICY_VERSION,
    source_id: input.sourceId ?? null,
  });
}

/** Mark every open consent for this purpose and person as withdrawn. Returns how many changed. */
export async function withdrawConsent(
  admin: SupabaseClient,
  input: { purpose: ConsentPurpose; userId?: string; email?: string },
) {
  let q = admin
    .from("consent_records")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("purpose", input.purpose)
    .is("withdrawn_at", null);
  if (input.userId) q = q.eq("user_id", input.userId);
  else if (input.email) q = q.eq("subject_email", input.email.toLowerCase());
  else throw new Error("withdrawConsent needs a userId or an email");
  const { data, error } = await q.select("id");
  return { error, count: data?.length ?? 0 };
}
