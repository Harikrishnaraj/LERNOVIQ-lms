import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { ThreadConversation, ThreadList } from "@/components/messaging/thread-view";
import { Badge } from "@/components/ui/badge";
import {
  computeTotalUnread,
  fetchInstructorThreads,
  fetchThreadMessages,
} from "@/features/messaging/messaging";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Messages · Instructor" };

export default async function InstructorMessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const requestedThread = one(raw.thread);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const threads = await fetchInstructorThreads(supabase);
  const totalUnread = computeTotalUnread(threads);

  // If a thread was requested by id, find it; otherwise default to first thread if available
  const activeThread =
    threads.find((t) => t.threadId === requestedThread) ??
    (requestedThread === "" && threads.length > 0 ? threads[0] : null);

  const messages = activeThread ? await fetchThreadMessages(supabase, activeThread.threadId) : [];

  return (
    <>
      <PageHeader
        title="Messages"
        description="Direct 1:1 communications with learners in your courses."
        actions={
          totalUnread > 0 ? (
            <Badge tone="primary" dot>
              {totalUnread} unread message{totalUnread === 1 ? "" : "s"}
            </Badge>
          ) : undefined
        }
      />

      {threads.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          description="When learners message you or you reach out to enrolled students, conversations will appear here."
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-12 min-h-[500px]">
          <div className="md:col-span-4 min-h-[300px]">
            <ThreadList threads={threads} activeThreadId={activeThread?.threadId} />
          </div>
          <div className="md:col-span-8">
            {activeThread ? (
              <ThreadConversation thread={activeThread} initialMessages={messages} />
            ) : (
              <div className="flex h-full items-center justify-center rounded-card border border-border bg-surface p-8 text-center text-text-secondary">
                <p>Select a conversation from the left to read messages.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
