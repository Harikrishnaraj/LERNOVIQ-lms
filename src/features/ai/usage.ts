import type { SupabaseClient } from "@supabase/supabase-js";
import {
  costUsd,
  type ChatFailureReason,
  type ChatMessage,
  type ChatProvider,
  type ChatResult,
} from "@/services/ai";
import { log } from "@/lib/log";

// The AI application service's recording half (F-700: "usage/cost recorded"). Server-only: it
// writes with the service-role client, after the caller has authenticated and authorised the
// user with the request-scoped client. ai_* tables grant no writes to authenticated users.

export interface ChatTurnInput {
  /** Service-role client. */
  db: SupabaseClient;
  provider: ChatProvider;
  userId: string;
  /** Continue this conversation; it must belong to userId. Omit to start a new one. */
  conversationId?: string;
  feature: "tutor" | "instructor" | "admin";
  courseId?: string | null;
  lessonId?: string | null;
  /** System prompt and earlier turns, sent before the question. */
  context: ChatMessage[];
  question: string;
  maxOutputTokens?: number;
}

export type ChatTurnOutput =
  | { ok: true; conversationId: string; result: ChatResult }
  | { ok: false; error: "conversation_not_found" | "storage_failed" };

/**
 * Asks the provider and records both turns with the call's usage and cost. A provider failure is
 * still recorded (status, error code, latency) and returned as a normal result for the UI to show
 * a recoverable message; only a database failure returns ok: false.
 */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnOutput> {
  const { db, provider, userId } = input;

  let conversationId = input.conversationId;
  if (conversationId) {
    const { data, error } = await db
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return storageFailed("lookup", error.message);
    if (!data) return { ok: false, error: "conversation_not_found" };
  } else {
    const { data, error } = await db
      .from("ai_conversations")
      .insert({
        user_id: userId,
        feature: input.feature,
        course_id: input.courseId ?? null,
        lesson_id: input.lessonId ?? null,
        title: input.question.slice(0, 200),
      })
      .select("id")
      .single();
    if (error || !data) return storageFailed("create", error?.message);
    conversationId = data.id as string;
  }

  const { error: userInsertError } = await db
    .from("ai_messages")
    .insert({ conversation_id: conversationId, role: "user", content: input.question });
  if (userInsertError) return storageFailed("user_message", userInsertError.message);

  const result = await provider.complete({
    messages: [...input.context, { role: "user", content: input.question }],
    maxOutputTokens: input.maxOutputTokens,
  });

  const { error: answerInsertError } = await db
    .from("ai_messages")
    .insert(assistantRow(conversationId, result));
  if (answerInsertError) return storageFailed("assistant_message", answerInsertError.message);

  // updated_at orders the learner's history and drives the 12-month retention purge.
  await db
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (!result.ok) {
    log.warn("ai.call_failed", {
      provider: result.provider,
      model: result.model,
      reason: result.reason,
      code: result.code,
    });
  }
  return { ok: true, conversationId, result };
}

export interface AssistantMessageRow {
  conversation_id: string;
  role: "assistant";
  content: string;
  status: "ok" | ChatFailureReason;
  error_code: string | null;
  provider: string;
  model: string;
  latency_ms: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
}

/** The ai_messages row for the provider's answer (or failure). Exported for tests. */
export function assistantRow(conversationId: string, result: ChatResult): AssistantMessageRow {
  const common = {
    conversation_id: conversationId,
    role: "assistant" as const,
    provider: result.provider,
    model: result.model,
    latency_ms: result.latencyMs,
  };
  if (!result.ok) {
    return {
      ...common,
      content: "",
      status: result.reason,
      error_code: result.code,
      input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    };
  }
  return {
    ...common,
    content: result.text.slice(0, 20000),
    status: "ok",
    error_code: null,
    input_tokens: result.usage.inputTokens,
    cached_input_tokens: result.usage.cachedInputTokens,
    output_tokens: result.usage.outputTokens,
    cost_usd: costUsd(result.model, result.usage),
  };
}

function storageFailed(step: string, message: string | undefined): ChatTurnOutput {
  log.error("ai.usage.storage_failed", { step, message });
  return { ok: false, error: "storage_failed" };
}
