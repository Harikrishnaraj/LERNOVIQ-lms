"use server";

import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { notify } from "@/services/notifications";
import { getStudentDetail, validateStudentMessage } from "./student-detail";

export type MessageResult = { ok: true; notice?: string } | { ok: false; error: string };

/**
 * Sends a short note to one student as an in-app notification (full two-way threads arrive with
 * messaging, T-106). The student is looked up through instructor_student_detail, which only
 * resolves for the course owner, so nobody can message learners outside their own courses.
 */
export async function messageStudent(enrollmentId: string, message: string): Promise<MessageResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const parsed = validateStudentMessage(message);
  if (!parsed.ok) return parsed;
  const student = await getStudentDetail(supabase, enrollmentId);
  if (!student) return { ok: false, error: "This student is not available." };
  if (!(await rateLimit("instructor-message", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { data: threadId, error: threadError } = await supabase.rpc("get_or_create_thread", {
    p_course_id: student.courseId,
    p_learner_id: student.userId,
  });
  const { error: insertError } = threadId
    ? await supabase.from("direct_messages").insert({ thread_id: threadId, sender_id: user.id, body: parsed.text })
    : { error: threadError ?? new Error("no thread") };
  if (insertError) return { ok: false, error: "We could not send that message. Please try again." };

  const sent = await notify({
    userId: student.userId,
    category: "course",
    title: `A message from your instructor about ${student.courseTitle}`,
    body: parsed.text,
    href: `/learner/courses/${(await supabase.from("courses").select("slug").eq("id", student.courseId).maybeSingle()).data?.slug ?? ""}`,
  });
  // The message is already stored in the thread; only the alert can be missing (GAP-127). `notify`
  // returns false when the student turned these notifications off, or if the alert failed.
  return sent
    ? { ok: true }
    : { ok: true, notice: "Message saved in your conversation, but the student was not alerted (they may have turned off course notifications)." };
}
