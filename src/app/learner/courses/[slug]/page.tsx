import { notFound, redirect } from "next/navigation";
import { getPlayerCourse } from "@/features/player/data";
import { resumeLessonId } from "@/features/player/navigation";
import { createClient } from "@/lib/supabase/server";

// Entry point for "Continue": jump to the first unfinished lesson of the enrolled version.
export default async function CourseEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const course = await getPlayerCourse(supabase, user.id, slug);
  if (!course) notFound();
  if (!course.enrolled) redirect(`/courses/${slug}`);

  const lessonId = resumeLessonId(course.sections, course.completedLessonIds);
  if (!lessonId) redirect(`/courses/${slug}`);
  redirect(`/learner/courses/${slug}/learn/${lessonId}`);
}
