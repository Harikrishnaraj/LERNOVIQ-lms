import type { SupabaseClient } from "@supabase/supabase-js";
import type { Currency, Visibility } from "./pricing-rules";

export interface PricingForEditing {
  priceCents: number;
  currency: Currency;
  certificateEnabled: boolean;
  visibility: Visibility;
  prerequisiteIds: string[];
  /** The instructor own other courses that could be a prerequisite. */
  candidates: { id: string; title: string }[];
}

/** Current pricing/settings of the version being authored plus the choosable prerequisites. */
export async function getPricingForEditing(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  versionId: string,
): Promise<PricingForEditing | null> {
  const { data: v } = await supabase
    .from("course_versions")
    .select("price_cents, currency, certificate_enabled, visibility")
    .eq("id", versionId)
    .maybeSingle();
  if (!v) return null;

  const { data: prereqs } = await supabase
    .from("course_prerequisites")
    .select("prerequisite_course_id")
    .eq("version_id", versionId);

  // Own courses (any status), titled by their newest version.
  const { data: own } = await supabase
    .from("courses")
    .select("id, course_versions!course_versions_course_id_fkey(title, version_number)")
    .eq("instructor_id", userId)
    .neq("id", courseId);
  const candidates = (own ?? []).map((c) => {
    const versions = (c.course_versions as unknown as { title: string; version_number: number }[]) ?? [];
    const latest = [...versions].sort((a, b) => b.version_number - a.version_number)[0];
    return { id: c.id as string, title: latest?.title ?? "Untitled course" };
  });

  return {
    priceCents: v.price_cents as number,
    currency: v.currency as Currency,
    certificateEnabled: v.certificate_enabled as boolean,
    visibility: v.visibility as Visibility,
    prerequisiteIds: (prereqs ?? []).map((p) => p.prerequisite_course_id as string),
    candidates: candidates.sort((a, b) => a.title.localeCompare(b.title)),
  };
}
