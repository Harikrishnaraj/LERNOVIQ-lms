import type { SupabaseClient } from "@supabase/supabase-js";
import { readSources } from "./tutor-prompt";
import { sourceViews, type TutorChatEntry } from "./tutor";

// Reads for the AI Tutor screen (T-201). They use the learner's session: ai_conversations and
// ai_messages RLS returns only the caller's own rows, and each query also filters on user_id.

export interface TutorConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MESSAGES = 200;

export async function listTutorConversations(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
): Promise<TutorConversationSummary[]> {
  const { data, error } = await supabase
    .from("ai_conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .eq("feature", "tutor")
    .eq("course_id", courseId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`ai_conversations failed: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id as string,
    title: (c.title as string | null) || "Untitled conversation",
    updatedAt: c.updated_at as string,
  }));
}

interface MessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: string;
  sources: unknown;
}

/** The learner's conversation in this course with its messages, or null if there is none. */
export async function getTutorConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  course: { courseId: string; slug: string },
): Promise<{ id: string; messages: TutorChatEntry[] } | null> {
  if (!UUID.test(conversationId)) return null;
  const { data: conversation, error } = await supabase
    .from("ai_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .eq("feature", "tutor")
    .eq("course_id", course.courseId)
    .maybeSingle();
  if (error) throw new Error(`ai_conversations failed: ${error.message}`);
  if (!conversation) return null;

  const { data: rows, error: messagesError } = await supabase
    .from("ai_messages")
    .select("id, role, content, status, sources")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(MAX_MESSAGES);
  if (messagesError) throw new Error(`ai_messages failed: ${messagesError.message}`);

  return {
    id: conversationId,
    messages: ((rows ?? []) as MessageRow[]).map((m) => {
      const failed = m.role === "assistant" && m.status !== "ok";
      const sources = sourceViews(readSources(m.sources), course.slug);
      return {
        id: m.id,
        role: m.role,
        text: m.content,
        sources,
        escalate: m.role === "assistant" && !failed && sources.length === 0,
        truncated: false,
        failed,
      };
    }),
  };
}
