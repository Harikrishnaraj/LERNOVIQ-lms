import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { LessonBody } from "@/components/player/lesson-body";
import { getCourseForReview } from "@/features/admin/review";
import { getLessonContent } from "@/features/player/data";
import { getAssetLinks, resolveVideoSrc } from "@/features/player/media";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Review lesson" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A reviewer reads a lesson exactly as a learner would (same LessonBody), read-only. */
export default async function ReviewLessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const { courseId, lessonId } = await params;
  if (!UUID.test(lessonId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!(await can(supabase, user.id, "course.read_all"))) redirect("/permission-denied");

  const course = await getCourseForReview(supabase, courseId);
  if (!course) notFound();
  const inVersion = course.snapshot.sections.some((s) => s.lessons.some((l) => l.id === lessonId));
  if (!inVersion) notFound();
  const lesson = await getLessonContent(supabase, lessonId);
  if (!lesson) notFound();

  const videoSrc = lesson.type === "video" ? await resolveVideoSrc(lesson.videoUrl) : null;
  const assets = await getAssetLinks(supabase, lessonId);

  return (
    <div className="max-w-3xl space-y-6">
      <Link href={`/admin/courses/${courseId}`} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to review: {course.title}
      </Link>
      <LessonBody lesson={lesson} videoSrc={videoSrc} savedPosition={0} assets={assets} />
    </div>
  );
}
