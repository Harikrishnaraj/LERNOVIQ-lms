import type { SupabaseClient } from "@supabase/supabase-js";

export const HEADLINE_MAX = 150;
export const BIO_MAX = 2000;

export interface PublicProfile {
  headline: string | null;
  bio: string | null;
}

export function validateHeadline(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: true, value: null };
  const value = input.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > HEADLINE_MAX) return { ok: false, error: `Keep your headline under ${HEADLINE_MAX} characters.` };
  return { ok: true, value };
}

export function validateBio(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: true, value: null };
  const value = input.trim();
  if (value === "") return { ok: true, value: null };
  if (value.length > BIO_MAX) return { ok: false, error: `Keep your bio under ${BIO_MAX} characters.` };
  return { ok: true, value };
}

/** The caller's own public profile fields (headline/bio), shown on their published courses. */
export async function getPublicProfile(supabase: SupabaseClient, userId: string): Promise<PublicProfile> {
  const { data, error } = await supabase.from("profiles").select("headline, bio").eq("id", userId).maybeSingle();
  if (error) throw new Error(`getPublicProfile failed: ${error.message}`);
  return { headline: (data?.headline as string | null) ?? null, bio: (data?.bio as string | null) ?? null };
}
