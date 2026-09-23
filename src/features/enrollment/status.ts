import type { SupabaseClient } from "@supabase/supabase-js";

export async function isEnrolled(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("enrollments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .neq("status", "cancelled")
    .maybeSingle();
  return data !== null;
}
