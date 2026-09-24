"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCourseForEditing } from "./queries";
import { validatePricing, wouldCreateCycle, type PricingInput } from "./pricing-rules";

export type PricingResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Saves price, currency, certificate switch, visibility and prerequisites of the version being authored. */
export async function savePricing(courseId: string, input: PricingInput): Promise<PricingResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const course = await getCourseForEditing(supabase, user.id, courseId);
  if (!course) return { ok: false, error: "This course is not available." };
  if (!course.editable) return { ok: false, error: "This course is locked while it is in review or published." };

  const parsed = validatePricing(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  const v = parsed.value;

  // Prerequisites must be the instructor own courses (not this one) and must not form a loop.
  const fieldErrors: Record<string, string> = {};
  if (v.prerequisiteIds.length > 0) {
    const { data: own } = await supabase.from("courses").select("id").eq("instructor_id", user.id).in("id", v.prerequisiteIds);
    const ownIds = new Set((own ?? []).map((c) => c.id as string));
    if (v.prerequisiteIds.some((id) => id === courseId || !ownIds.has(id))) {
      fieldErrors.prerequisiteIds = "Choose prerequisites from your other courses.";
    } else {
      const { data: edges } = await supabase.from("course_prerequisites").select("prerequisite_course_id, course_versions!inner(course_id)");
      const graph = new Map<string, string[]>();
      for (const e of edges ?? []) {
        const from = (e.course_versions as unknown as { course_id: string }).course_id;
        if (from === courseId) continue; // this course edges are being replaced
        graph.set(from, [...(graph.get(from) ?? []), e.prerequisite_course_id as string]);
      }
      if (wouldCreateCycle(courseId, v.prerequisiteIds, graph)) {
        fieldErrors.prerequisiteIds = "That would create a loop: one of those courses already requires this course.";
      }
    }
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };

  const { data, error } = await supabase
    .from("course_versions")
    .update({
      price_cents: v.priceCents,
      currency: v.currency,
      certificate_enabled: v.certificateEnabled,
      visibility: v.visibility,
    })
    .eq("id", course.version.id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "We could not save your changes. Please try again." };

  const del = await supabase.from("course_prerequisites").delete().eq("version_id", course.version.id);
  if (del.error) return { ok: false, error: "We could not save the prerequisites. Please try again." };
  if (v.prerequisiteIds.length > 0) {
    const ins = await supabase
      .from("course_prerequisites")
      .insert(v.prerequisiteIds.map((id) => ({ version_id: course.version.id, prerequisite_course_id: id })));
    if (ins.error) return { ok: false, error: "We could not save the prerequisites. Please try again." };
  }

  revalidatePath(`/instructor/courses/${courseId}/pricing`);
  revalidatePath("/instructor/courses");
  return { ok: true };
}
