import { notFound, redirect } from "next/navigation";
import { getCourseForEditing } from "@/features/course-authoring/queries";
import { createClient } from "@/lib/supabase/server";

// Interim entry point until the Course Overview page (T-059) replaces it: resume authoring.
export default async function CourseEntryPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const course = user ? await getCourseForEditing(supabase, user.id, courseId) : null;
  if (!course) notFound();
  redirect(`/instructor/courses/${course.courseId}/basics`);
}
