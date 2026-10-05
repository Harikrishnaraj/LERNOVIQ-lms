"use server";

import { revalidatePath } from "next/cache";
import { validateCoursePrice, type CoursePriceInput } from "@/features/course-authoring/pricing-rules";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";

export type CoursePriceResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Sets a course's price for every version of it (ADR-037: the platform sells courses; instructors
 * do not set prices). The RPC re-checks the `course.price` permission and the price bounds.
 */
export async function setCoursePriceAction(courseId: string, input: CoursePriceInput): Promise<CoursePriceResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = validateCoursePrice(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  const { priceCents, currency } = parsed.value;

  const { error } = await supabase.rpc("admin_set_course_price", {
    p_course_id: courseId,
    p_price_cents: priceCents,
    p_currency: currency,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "You do not have permission to change course prices." };
    if (error.code === "P0002") return { ok: false, error: "This course no longer exists." };
    return { ok: false, error: "We could not save the price. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "course.price_changed",
    resourceType: "course",
    resourceId: courseId,
    metadata: { price_cents: priceCents, currency },
  });

  revalidatePath(`/admin/courses/${courseId}`);
  revalidatePath("/admin/courses");
  return { ok: true };
}
