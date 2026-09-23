"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveResult = { saved: boolean } | { error: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Toggles the caller's bookmark on a published course. Public endpoint: validate the slug,
// resolve the course server-side and rely on RLS (own rows only, published courses only).
export async function toggleSaveCourse(slug: string): Promise<SaveResult> {
  if (typeof slug !== "string" || !SLUG.test(slug))
    return { error: "This course is not available." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in to save courses." };

  const { data: course } = await supabase
    .from("courses")
    .select("id")
    .eq("slug", slug)
    .not("published_version_id", "is", null)
    .maybeSingle();
  if (!course) return { error: "This course is not available." };

  const { data: existing } = await supabase
    .from("saved_courses")
    .select("course_id")
    .eq("user_id", user.id)
    .eq("course_id", course.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("saved_courses")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", course.id)
    : await supabase.from("saved_courses").insert({ user_id: user.id, course_id: course.id });
  if (error) return { error: "We could not update your saved courses. Please try again." };

  revalidatePath(`/courses/${slug}`);
  revalidatePath("/learner/my-learning");
  return { saved: !existing };
}
