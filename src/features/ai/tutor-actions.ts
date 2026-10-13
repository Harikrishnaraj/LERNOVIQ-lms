"use server";

import { getChatProvider } from "@/services/ai";
import { createAdminClient } from "@/services/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";
import { checkTutorAllowance } from "./policy";
import { answerTutorQuestion, type TutorQuestion, type TutorReply } from "./tutor";

// Server action behind the AI Tutor chat (/learner/ai-tutor and the course player panel).

export async function askTutor(input: TutorQuestion): Promise<TutorReply> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "no_access", error: "Please log in again." };

  try {
    return await answerTutorQuestion(
      {
        supabase,
        db: createAdminClient(),
        provider: getChatProvider(),
        userId: user.id,
        allow: () => checkTutorAllowance(user.id),
      },
      {
        question: input?.question,
        courseId: input?.courseId,
        lessonId: input?.lessonId,
        conversationId: input?.conversationId,
      },
    );
  } catch (e) {
    log.error("ai.tutor.failed", { message: e instanceof Error ? e.message : String(e) });
    return {
      ok: false,
      code: "unavailable",
      error: "The AI Tutor isn't available right now. Try again later.",
    };
  }
}
