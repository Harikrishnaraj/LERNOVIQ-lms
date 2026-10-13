import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CircleOff, Lock, MessageSquarePlus } from "lucide-react";
import { TutorChat } from "@/components/ai-tutor/tutor-chat";
import { EmptyState, ErrorState, PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { getTutorMode, hasTutorAccess } from "@/features/ai/policy";
import { getAiSettings } from "@/features/ai/settings";
import { getTutorConversation, listTutorConversations } from "@/features/ai/tutor-queries";
import { getMyLearning } from "@/features/my-learning/queries";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "AI Tutor" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

// Learner AI Tutor (T-201, F-701): pick a course, ask questions answered from its lessons, and
// reopen earlier conversations. Off until an admin turns it on for the learner (ADR-043).
export default async function AiTutorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const header = (
    <PageHeader title="AI Tutor" description="Ask questions answered from your course lessons." />
  );

  // Platform kill switch first (ADR-045): when it is off nobody can use the tutor.
  const settings = await getAiSettings(supabase);
  if (!settings) {
    return (
      <>
        {header}
        <ErrorState
          title="The AI Tutor isn't available right now"
          description="Try again in a few minutes."
        />
      </>
    );
  }
  if (!settings.tutorEnabled) {
    return (
      <>
        {header}
        <PermissionDeniedState
          icon={CircleOff}
          title="The AI Tutor is turned off right now"
          description="Your administrator has turned the AI Tutor off for everyone. It will be back when they turn it on again."
        />
      </>
    );
  }

  if (!(await hasTutorAccess(supabase))) {
    return (
      <>
        {header}
        <PermissionDeniedState
          icon={Lock}
          title="The AI Tutor isn't turned on for your account"
          description="An administrator turns the AI Tutor on for each learner. Ask your administrator if you need it."
        />
      </>
    );
  }

  const learning = await getMyLearning(supabase);
  if (learning.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon={BookOpen}
          title="Enroll in a course to use the AI Tutor"
          description="The AI Tutor answers questions about the courses you're enrolled in."
          action={
            <Link href="/courses" className={buttonClasses()}>
              Browse courses
            </Link>
          }
        />
      </>
    );
  }

  const course = learning.find((c) => c.slug === one(raw.course)) ?? learning[0];
  const conversationParam = one(raw.c);
  const [conversations, opened, mode] = await Promise.all([
    listTutorConversations(supabase, user.id, course.courseId),
    conversationParam
      ? getTutorConversation(supabase, user.id, conversationParam, course)
      : Promise.resolve(null),
    settings.hintOnlyAlways
      ? Promise.resolve("hint_only" as const)
      : getTutorMode(supabase, course.courseId),
  ]);
  const courseHref = `/learner/ai-tutor?course=${encodeURIComponent(course.slug)}`;

  return (
    <>
      {header}

      {learning.length > 1 && (
        <form
          method="get"
          action="/learner/ai-tutor"
          className="mb-4 flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Course
            <select
              name="course"
              defaultValue={course.slug}
              className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal"
            >
              {learning.map((c) => (
                <option key={c.courseId} value={c.slug}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={buttonClasses({ variant: "secondary" })}>
            Switch course
          </button>
        </form>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <TutorChat
            key={`${course.courseId}:${opened?.id ?? "new"}`}
            courseId={course.courseId}
            courseTitle={course.title}
            initialConversationId={opened?.id ?? null}
            initialMessages={opened?.messages ?? []}
            mode={mode}
            refreshOnAnswer
          />
        </div>

        <nav aria-label="Earlier conversations" className="w-full shrink-0 lg:w-72">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Earlier conversations</h2>
            {opened && (
              <Link
                href={courseHref}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <MessageSquarePlus className="size-4" aria-hidden="true" />
                New
              </Link>
            )}
          </div>
          {conversations.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No conversations about {course.title} yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`${courseHref}&c=${c.id}`}
                    aria-current={c.id === opened?.id ? "page" : undefined}
                    className={cn(
                      "block rounded-control px-3 py-2 text-sm hover:bg-border-subtle",
                      c.id === opened?.id && "bg-primary-light",
                    )}
                  >
                    <span className="line-clamp-2">{c.title}</span>
                    <span className="text-xs text-text-secondary">
                      {dateFormat.format(new Date(c.updatedAt))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </nav>
      </div>
    </>
  );
}
