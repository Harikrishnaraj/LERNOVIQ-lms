"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { notify } from "@/services/notifications";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { validateDirectMessage } from "./messaging";

export type SendResult = { ok: true; messageId: string } | { ok: false; error: string };
export type ReadResult = { ok: true; count: number } | { ok: false; error: string };
export type StartThreadResult = { ok: true; threadId: string } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ALLOWED = "You cannot send messages in this thread.";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function sendDirectMessage(threadId: string, body: string): Promise<SendResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(threadId)) return { ok: false, error: NOT_ALLOWED };

  const parsed = validateDirectMessage(body);
  if (!parsed.ok) return parsed;

  if (!(await rateLimit("instructor-message", await clientIp(), user.id))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  // Insert into direct_messages under RLS
  const { data: inserted, error: insertError } = await supabase
    .from("direct_messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      body: parsed.body,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { ok: false, error: NOT_ALLOWED };
  }

  // Lookup the recipient in the thread
  const { data: thread } = await supabase
    .from("message_threads")
    .select("instructor_id, learner_id, course:courses!course_id(title)")
    .eq("id", threadId)
    .maybeSingle();

  if (thread) {
    const recipientId = user.id === thread.instructor_id ? thread.learner_id : thread.instructor_id;
    const course = thread.course as unknown as { title: string } | null;
    const courseTitle = course?.title ?? "Course";

    await notify({
      userId: recipientId,
      category: "course",
      title: `Direct message regarding ${courseTitle}`,
      body: parsed.body.slice(0, 150),
      href: `/instructor/messages?thread=${threadId}`,
    });
  }

  revalidatePath("/instructor/messages");
  return { ok: true, messageId: inserted.id as string };
}

export async function markThreadRead(threadId: string): Promise<ReadResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(threadId)) return { ok: false, error: NOT_ALLOWED };

  const { data, error } = await supabase.rpc("mark_thread_read", { p_thread_id: threadId });
  if (error) return { ok: false, error: NOT_ALLOWED };

  revalidatePath("/instructor/messages");
  return { ok: true, count: Number(data ?? 0) };
}

export async function startThread(courseId: string, learnerId: string): Promise<StartThreadResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(courseId) || !UUID.test(learnerId)) return { ok: false, error: NOT_ALLOWED };

  const { data, error } = await supabase.rpc("get_or_create_thread", {
    p_course_id: courseId,
    p_learner_id: learnerId,
  });

  if (error || !data) return { ok: false, error: "Could not open message thread." };

  revalidatePath("/instructor/messages");
  return { ok: true, threadId: data as string };
}
