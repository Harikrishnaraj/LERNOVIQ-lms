"use server";

import { revalidatePath } from "next/cache";
import { getCourseDetail } from "@/features/catalog/course-detail";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export type EnrollResult = { enrolled: true } | { error: string };

// Public endpoint: never trust the client. Only the slug is accepted; the course, its live
// version and its price are all re-read here. RLS is the second line of defence (it only
// allows self-enrolment into a published FREE course).
export async function enrollInCourse(slug: string): Promise<EnrollResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to enroll." };
  if (!(await can(supabase, user.id, "portal.learner.access"))) {
    return { error: "Your account cannot enroll in courses." };
  }

  const course = typeof slug === "string" ? await getCourseDetail(supabase, slug) : null;
  if (!course) return { error: "This course is not available." };
  if (course.priceCents > 0) {
    return { error: "This course requires payment, and checkout is not available yet." };
  }

  const { error } = await supabase
    .from("enrollments")
    .insert({ user_id: user.id, course_id: course.id, version_id: course.versionId });

  // 23505 = already enrolled (unique user_id + course_id): idempotent success.
  if (error && error.code !== "23505") {
    return { error: "We could not enroll you. Please try again." };
  }

  revalidatePath(`/courses/${course.slug}`);
  return { enrolled: true };
}
