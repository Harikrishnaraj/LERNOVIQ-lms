import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGE_MAX_LEN, type DirectMessage, type InstructorMessageThread } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateDirectMessage(body: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const text = typeof body === "string" ? body.trim() : "";
  if (text.length === 0) return { ok: false, error: "Write a message first." };
  if (text.length > MESSAGE_MAX_LEN) {
    return { ok: false, error: `Keep message under ${MESSAGE_MAX_LEN.toLocaleString("en-US")} characters.` };
  }
  return { ok: true, body: text };
}

export function filterMessageThreads(
  threads: InstructorMessageThread[],
  query: string,
): InstructorMessageThread[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter(
    (t) =>
      t.learnerName.toLowerCase().includes(q) ||
      t.courseTitle.toLowerCase().includes(q) ||
      (t.lastMessage && t.lastMessage.toLowerCase().includes(q)),
  );
}

export function computeTotalUnread(threads: InstructorMessageThread[]): number {
  return threads.reduce((acc, t) => acc + t.unreadCount, 0);
}

export async function fetchInstructorThreads(
  supabase: SupabaseClient,
): Promise<InstructorMessageThread[]> {
  const { data, error } = await supabase.rpc("list_instructor_threads");
  if (error) throw new Error(`list_instructor_threads failed: ${error.message}`);
  return ((data ?? []) as {
    thread_id: string;
    course_id: string;
    course_title: string;
    learner_id: string;
    learner_name: string;
    last_message: string | null;
    last_message_at: string | null;
    unread_count: number;
  }[]).map((r) => ({
    threadId: r.thread_id,
    courseId: r.course_id,
    courseTitle: r.course_title,
    learnerId: r.learner_id,
    learnerName: r.learner_name,
    lastMessage: r.last_message,
    lastMessageAt: r.last_message_at,
    unreadCount: r.unread_count,
  }));
}

export async function fetchThreadMessages(
  supabase: SupabaseClient,
  threadId: string,
): Promise<DirectMessage[]> {
  if (!UUID.test(threadId)) return [];
  const { data, error } = await supabase.rpc("get_thread_messages", { p_thread_id: threadId });
  if (error) throw new Error(`get_thread_messages failed: ${error.message}`);
  return ((data ?? []) as {
    message_id: string;
    sender_id: string;
    sender_name: string;
    body: string;
    read_at: string | null;
    created_at: string;
    is_mine: boolean;
  }[]).map((r) => ({
    messageId: r.message_id,
    senderId: r.sender_id,
    senderName: r.sender_name,
    body: r.body,
    readAt: r.read_at,
    createdAt: r.created_at,
    isMine: r.is_mine,
  }));
}

export async function fetchOrCreateThread(
  supabase: SupabaseClient,
  courseId: string,
  learnerId: string,
): Promise<string | null> {
  if (!UUID.test(courseId) || !UUID.test(learnerId)) return null;
  const { data, error } = await supabase.rpc("get_or_create_thread", {
    p_course_id: courseId,
    p_learner_id: learnerId,
  });
  if (error) return null;
  return data as string;
}
