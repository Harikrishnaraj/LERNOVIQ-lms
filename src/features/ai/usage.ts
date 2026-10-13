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
  /**
   * Answer with this text instead of calling the provider (the tutor does this when nothing in the
   * course matched, rather than letting the model guess). Stored with no provider, model or cost.
   */
  fixedAnswer?: string;
  /** Turns the provider's text into the stored answer and the sources it cites (T-224). */
  shapeAnswer?: (text: string) => StoredAnswer;
}

export interface StoredAnswer {
  text: string;
  sources: unknown[];
}

export type ChatTurnOutput =
  | {
      ok: true;
      conversationId: string;
      /** The provider's result, or null for a fixed answer. */
      result: ChatResult | null;
      /** What was stored as the answer; empty text when the provider failed. */
      answer: StoredAnswer;
    }
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

  let result: ChatResult | null = null;
  let row: AssistantMessageRow;
  if (input.fixedAnswer !== undefined) {
    row = fixedAnswerRow(conversationId, input.fixedAnswer);
  } else {
    result = await provider.complete({
      messages: [...input.context, { role: "user", content: input.question }],
      maxOutputTokens: input.maxOutputTokens,
    });
    row = assistantRow(conversationId, result, input.shapeAnswer);
  }
  const answer: StoredAnswer = { text: row.content, sources: row.sources };

  const { error: answerInsertError } = await db.from("ai_messages").insert(row);
  if (answerInsertError) return storageFailed("assistant_message", answerInsertError.message);

  // updated_at orders the learner's history and drives the 12-month retention purge.
  await db
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (result && !result.ok) {
    log.warn("ai.call_failed", {
      provider: result.provider,
      model: result.model,
      reason: result.reason,
      code: result.code,
    });
  }
  return { ok: true, conversationId, result, answer };
}

export interface AssistantMessageRow {
  conversation_id: string;
  role: "assistant";
  content: string;
  status: "ok" | ChatFailureReason;
  error_code: string | null;
  provider: string | null;
  model: string | null;
  latency_ms: number;
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  sources: unknown[];
}

const MAX_CONTENT = 20000;

/** The ai_messages row for the provider's answer (or failure). Exported for tests. */
export function assistantRow(
  conversationId: string,
  result: ChatResult,
  shapeAnswer?: (text: string) => StoredAnswer,
): AssistantMessageRow {
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
      sources: [],
    };
  }
  const shaped = shapeAnswer ? shapeAnswer(result.text) : { text: result.text, sources: [] };
  return {
    ...common,
    content: shaped.text.slice(0, MAX_CONTENT),
    sources: shaped.sources,
    status: "ok",
    error_code: null,
    input_tokens: result.usage.inputTokens,
    cached_input_tokens: result.usage.cachedInputTokens,
    output_tokens: result.usage.outputTokens,
    cost_usd: costUsd(result.model, result.usage),
  };
}

/** A fixed answer: no provider was called, so there is no model, usage or cost to record. */
export function fixedAnswerRow(conversationId: string, text: string): AssistantMessageRow {
  return {
    conversation_id: conversationId,
    role: "assistant",
    content: text.slice(0, MAX_CONTENT),
    status: "ok",
    error_code: null,
    provider: null,
    model: null,
    latency_ms: 0,
    input_tokens: null,
    cached_input_tokens: null,
    output_tokens: null,
    cost_usd: null,
    sources: [],
  };
}

function storageFailed(step: string, message: string | undefined): ChatTurnOutput {
  log.error("ai.usage.storage_failed", { step, message });
  return { ok: false, error: "storage_failed" };
}
