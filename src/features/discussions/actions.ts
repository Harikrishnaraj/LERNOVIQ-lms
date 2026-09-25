"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { RATE_LIMITED_MESSAGE, clientIp, rateLimit } from "@/services/rate-limit";
import { validateReason, validateReply, validateThread } from "./discussions";

export type ThreadResult =
  | { ok: true; id: string }
  | { ok: false; error: string; fieldErrors?: { title?: string; body?: string } };
export type ActionResult = { ok: true } | { ok: false; error: string };
export type VoteResult = { ok: true; voted: boolean; votes: number } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ALLOWED = "You cannot do that in this discussion.";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function paths(id?: string) {
  revalidatePath("/learner/discussions");
  if (id) revalidatePath(`/learner/discussions/${id}`);
}

/** Starts a thread in a course the learner is enrolled in (RLS enforces access and authorship). */
export async function startDiscussion(courseId: string, input: { title: string; body: string }): Promise<ThreadResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(courseId)) return { ok: false, error: "Choose a course." };
  const parsed = validateThread(input);
  if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.errors };
  if (!(await rateLimit("discussion-post", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { data, error } = await supabase
    .from("discussions")
    .insert({ course_id: courseId, author_id: user.id, title: parsed.title, body: parsed.body })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "You can only start a discussion in a course you are enrolled in." };
  paths();
  return { ok: true, id: data.id as string };
}

export async function postReply(discussionId: string, body: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(discussionId)) return { ok: false, error: NOT_ALLOWED };
  const parsed = validateReply(body);
  if (!parsed.ok) return parsed;
  if (!(await rateLimit("discussion-post", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };

  const { error } = await supabase.from("discussion_posts").insert({ discussion_id: discussionId, author_id: user.id, body: parsed.body });
  if (error) return { ok: false, error: NOT_ALLOWED };
  paths(discussionId);
  return { ok: true };
}

export async function toggleVote(type: "thread" | "post", targetId: string, discussionId: string): Promise<VoteResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if ((type !== "thread" && type !== "post") || !UUID.test(targetId)) return { ok: false, error: NOT_ALLOWED };
  if (!(await rateLimit("discussion-react", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const { data, error } = await supabase.rpc("toggle_discussion_vote", { p_type: type, p_id: targetId });
  if (error) {
    return { ok: false, error: error.message.includes("your own") ? "You cannot upvote your own post." : NOT_ALLOWED };
  }
  paths(discussionId);
  const r = data as { voted: boolean; votes: number };
  return { ok: true, voted: r.voted, votes: r.votes };
}

export async function reportContent(type: "thread" | "post", targetId: string, reason: string, discussionId: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if ((type !== "thread" && type !== "post") || !UUID.test(targetId)) return { ok: false, error: NOT_ALLOWED };
  const parsed = validateReason(reason);
  if (!parsed.ok) return parsed;
  if (!(await rateLimit("discussion-react", await clientIp(), user.id))) return { ok: false, error: RATE_LIMITED_MESSAGE };
  const { error } = await supabase.rpc("report_discussion", { p_type: type, p_id: targetId, p_reason: parsed.reason });
  if (error) return { ok: false, error: error.message.includes("your own") ? "You cannot report your own post." : NOT_ALLOWED };
  paths(discussionId);
  return { ok: true };
}

/** Mark a reply as the answer, or pass null to clear it. */
export async function markAnswered(discussionId: string, postId: string | null): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(discussionId) || (postId !== null && !UUID.test(postId))) return { ok: false, error: NOT_ALLOWED };
  const { error } = await supabase.rpc("mark_discussion_answered", { p_discussion_id: discussionId, p_post_id: postId });
  if (error) return { ok: false, error: NOT_ALLOWED };
  paths(discussionId);
  return { ok: true };
}

export async function deleteOwn(type: "thread" | "post", id: string, discussionId: string): Promise<ActionResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(id)) return { ok: false, error: NOT_ALLOWED };
  const { data, error } = await supabase
    .from(type === "thread" ? "discussions" : "discussion_posts")
    .delete()
    .eq("id", id)
    .eq("author_id", user.id)
    .select("id");
  if (error || !data?.length) return { ok: false, error: NOT_ALLOWED };
  paths(discussionId);
  return { ok: true };
}
