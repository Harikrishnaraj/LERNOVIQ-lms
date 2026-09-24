import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye } from "lucide-react";
import { LessonBody } from "@/components/player/lesson-body";
import { PlayerSidebar } from "@/components/player/player-sidebar";
import { buttonClasses } from "@/components/ui/button";
import { getCoursePreview } from "@/features/course-authoring/preview";
import { getLessonContent } from "@/features/player/data";
import { getAssetLinks, resolveVideoSrc } from "@/features/player/media";
import { adjacentLessons } from "@/features/player/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preview lesson" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** F-208: the learner lesson view for the instructor own newest version, read-only (no progress). */
export default async function PreviewLessonPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  if (!UUID.test(lessonId)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const preview = user ? await getCoursePreview(supabase, user.id, courseId) : null;
  if (!preview) notFound();

  const { previous, next, index, total } = adjacentLessons(preview.sections, lessonId);
  if (index === -1) notFound();
  const lesson = await getLessonContent(supabase, lessonId);
  if (!lesson) notFound();

  const videoSrc = lesson.type === "video" ? await resolveVideoSrc(lesson.videoUrl) : null;
  const assets = await getAssetLinks(supabase, lessonId);
  const base = `/instructor/courses/${preview.courseId}/preview`;
  const { data: quiz } =
    lesson.type === "quiz"
      ? await supabase.from("assessments").select("id, title").eq("lesson_id", lessonId).maybeSingle()
      : { data: null };

  return (
    <div className="space-y-4">
      <p role="status" className="flex flex-wrap items-center gap-2 rounded-card border border-info bg-info-light p-3 text-sm text-info-text">
        <Eye className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          Preview: this is what learners see in <strong>{preview.title}</strong>. Nothing you do here is saved
          as progress.
        </span>
        <Link href={`/instructor/courses/${preview.courseId}/curriculum`} className="font-semibold underline">
          Back to editing
        </Link>
      </p>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-6">
          <p className="text-xs text-text-secondary">
            Lesson {index + 1} of {total}
          </p>
          <LessonBody lesson={lesson} videoSrc={videoSrc} savedPosition={0} assets={assets} />

          {quiz && (
            <Link
              href={`/instructor/courses/${preview.courseId}/assessments/${quiz.id}`}
              className={buttonClasses({ variant: "secondary", size: "lg" })}
            >
              Assessment: {quiz.title} (open in builder)
            </Link>
          )}

          <nav aria-label="Lesson navigation" className="flex items-center justify-between gap-3 border-t border-border pt-4">
            {previous ? (
              <Link href={`${base}/${previous.id}`} className={buttonClasses({ variant: "secondary" })}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Previous
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`${base}/${next.id}`} className={buttonClasses()}>
                Next
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>

        <aside aria-label="Course curriculum" className="w-full shrink-0 lg:w-80">
          <div className="rounded-card border border-border bg-surface p-3">
            <PlayerSidebar
              courseSlug=""
              sections={preview.sections}
              currentLessonId={lessonId}
              completed={new Set()}
              enrolled
              basePath={base}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
