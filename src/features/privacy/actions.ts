"use server";

import { revalidatePath } from "next/cache";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { sendEmail } from "@/services/email";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { createAdminClient } from "@/services/supabase/admin";
import { deletionNotice, usesPassword } from "./account";
import { withdrawConsent } from "./consent";
import { CONSENT_PURPOSES, type ConsentPurpose } from "./consent-purposes";

export type PrivacyResult = { ok: true } | { ok: false; error: string };

const REVALIDATE_PATHS = ["/learner/settings", "/instructor/settings", "/admin/profile"];

/** Throwaway client: checking a password must not replace the caller's session. */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const client = createAnonClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

async function notify(email: string | undefined, notice: { subject: string; html: string }) {
  if (email) await sendEmail({ to: email, ...notice });
}

/**
 * Marks the account for deletion; a nightly job (purge_expired_accounts) removes it after a 30-day grace
 * period unless staff placed a legal hold. Identity is re-checked (F-441): password for password accounts,
 * the account email typed out for provider accounts. Failed checks count against the rate limit and are audited.
 */
export async function requestAccountDeletionAction(proof: string): Promise<PrivacyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("account-privacy", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const email = user.email ?? "";
  const verified = usesPassword(user)
    ? proof.length > 0 && (await passwordMatches(email, proof))
    : proof.trim().toLowerCase() === email.toLowerCase() && email !== "";
  if (!verified) {
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email ?? null,
      action: "account.deletion_refused",
      resourceType: "profile",
      resourceId: user.id,
    });
    return { ok: false, error: usesPassword(user) ? "That password is not correct." : "That email does not match this account." };
  }

  const requestedAt = new Date();
  const { error } = await supabase.from("profiles").update({ deletion_requested_at: requestedAt.toISOString() }).eq("id", user.id);
  if (error) return { ok: false, error: "We could not process that. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "account.deletion_requested",
    resourceType: "profile",
    resourceId: user.id,
  });
  await notify(user.email, deletionNotice("requested", requestedAt));
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { ok: true };
}

/** Cancels a pending deletion request, any time before the 30-day grace period elapses. */
export async function cancelAccountDeletionAction(): Promise<PrivacyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("account-privacy", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { error } = await supabase.from("profiles").update({ deletion_requested_at: null }).eq("id", user.id);
  if (error) return { ok: false, error: "We could not process that. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "account.deletion_cancelled",
    resourceType: "profile",
    resourceId: user.id,
  });
  await notify(user.email, deletionNotice("cancelled"));
  for (const path of REVALIDATE_PATHS) revalidatePath(path);
  return { ok: true };
}

/**
 * T-299 (F-443): the signed-in person withdraws every consent still open for them, under their account
 * or their sign-in email. Contract-based processing is unaffected; only consent-based uses stop.
 */
export async function withdrawMyConsentsAction(): Promise<{ ok: true; withdrawn: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await rateLimit("account-privacy", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const admin = createAdminClient();
  let withdrawn = 0;
  for (const purpose of Object.keys(CONSENT_PURPOSES) as ConsentPurpose[]) {
    for (const who of [{ userId: user.id }, ...(user.email ? [{ email: user.email }] : [])]) {
      const res = await withdrawConsent(admin, { purpose, ...who });
      if (res.error) return { ok: false, error: "We could not update your consents. Please try again." };
      withdrawn += res.count;
    }
  }
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "consent.withdrawn",
    resourceType: "user",
    resourceId: user.id,
    metadata: { withdrawn },
  });
  return { ok: true, withdrawn };
}
