import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { PlayerSidebar } from "@/components/player/player-sidebar";
import { buttonClasses } from "@/components/ui/button";
import { getLessonContent, getPlayerCourse } from "@/features/player/data";
import { adjacentLessons, isLessonLocked } from "@/features/player/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizeLessonHtml } from "@/lib/sanitize";

export const metadata: Metadata = { title: "Lesson" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string; lessonId: string }>;
}) {
  const { slug, lessonId } = await params;
  if (!UUID.test(lessonId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const course = await getPlayerCourse(supabase, user.id, slug);
  if (!course) notFound();

  const { previous, next, index, total } = adjacentLessons(course.sections, lessonId);
  const outlineLesson = course.sections.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
  if (!outlineLesson) notFound();
  // Locked lessons are never opened: send the viewer to the course page instead.
  if (isLessonLocked(outlineLesson, course.enrolled)) redirect(`/courses/${slug}`);

  const lesson = await getLessonContent(supabase, lessonId);
  if (!lesson) redirect(`/courses/${slug}`); // RLS says no

  const safeHtml = sanitizeLessonHtml(lesson.content);
  const videoOk = lesson.videoUrl?.startsWith("https://") ?? false;
  const lessonHref = (id: string) => `/learner/courses/${slug}/learn/${id}`;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
        <Link
          href="/learner/my-learning"
          className="inline-flex items-center gap-1 rounded-control text-sm text-text-secondary hover:text-text"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          My Learning
        </Link>
        <span aria-hidden="true" className="text-border">
          |
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold">{course.title}</p>
        <p className="shrink-0 text-xs text-text-secondary">
          Lesson {index + 1} of {total}
        </p>
      </header>

      {!course.enrolled && (
        <p role="status" className="bg-info-light px-4 py-2 text-sm text-info-text">
          You are previewing this course.{" "}
          <Link href={`/courses/${slug}`} className="font-semibold underline">
            Enroll to unlock every lesson
          </Link>
        </p>
      )}

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row">
        <main id="main" className="min-w-0 flex-1 space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">{lesson.title}</h1>

          {lesson.type === "video" && videoOk && (
            <video
              controls
              preload="metadata"
              src={lesson.videoUrl!}
              className="aspect-video w-full rounded-card bg-black"
            >
              Your browser does not support video playback.
            </video>
          )}
          {lesson.type === "video" && !videoOk && (
            <p className="rounded-card border border-dashed border-border bg-surface p-6 text-sm text-text-secondary">
              The video for this lesson is not available yet.
            </p>
          )}

          {safeHtml.trim() !== "" && (
            <div
              className="prose-lesson space-y-3 text-text [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-control [&_pre]:bg-border-subtle [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          )}

          <nav aria-label="Lesson navigation" className="flex items-center justify-between gap-3 border-t border-border pt-4">
            {previous && !isLessonLocked(previous, course.enrolled) ? (
              <Link href={lessonHref(previous.id)} className={buttonClasses({ variant: "secondary" })}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Previous
              </Link>
            ) : (
              <span />
            )}
            {next && !isLessonLocked(next, course.enrolled) ? (
              <Link href={lessonHref(next.id)} className={buttonClasses()}>
                Next
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </main>

        <aside aria-label="Course curriculum" className="w-full shrink-0 lg:w-80">
          <details open className="rounded-card border border-border bg-surface lg:[&>summary]:hidden" >
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold lg:hidden">
              Course content
            </summary>
            <div className="max-h-[70vh] overflow-y-auto p-3">
              <PlayerSidebar
                courseSlug={slug}
                sections={course.sections}
                currentLessonId={lessonId}
                completed={course.completedLessonIds}
                enrolled={course.enrolled}
              />
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}
