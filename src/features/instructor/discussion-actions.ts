"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";

export type PinResult = { ok: true; pinned: boolean } | { ok: false; error: string };
export type ModerateResult = { ok: true } | { ok: false; error: string };
export type ResolveResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_ALLOWED = "You cannot moderate this discussion.";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function revalidateDiscussions(discussionId?: string) {
  revalidatePath("/instructor/discussions");
  revalidatePath("/learner/discussions");
  if (discussionId) {
    revalidatePath(`/instructor/discussions/${discussionId}`);
    revalidatePath(`/learner/discussions/${discussionId}`);
  }
}

/** Toggles pinned status for a discussion in an instructor's course. */
export async function togglePin(discussionId: string): Promise<PinResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(discussionId)) return { ok: false, error: NOT_ALLOWED };
  if (!(await rateLimit("discussion-react", await clientIp(), user.id))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const { data, error } = await supabase.rpc("toggle_discussion_pinned", {
    p_discussion_id: discussionId,
  });
  if (error) return { ok: false, error: NOT_ALLOWED };

  revalidateDiscussions(discussionId);
  return { ok: true, pinned: Boolean(data) };
}

/** Hides or unhides a discussion thread or reply post. */
export async function moderateContent(
  type: "thread" | "post",
  targetId: string,
  hidden: boolean,
  discussionId: string,
): Promise<ModerateResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if ((type !== "thread" && type !== "post") || !UUID.test(targetId)) {
    return { ok: false, error: NOT_ALLOWED };
  }
  if (!UUID.test(discussionId)) return { ok: false, error: NOT_ALLOWED };
  if (!(await rateLimit("discussion-react", await clientIp(), user.id))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const { error } = await supabase.rpc("set_discussion_hidden", {
    p_type: type,
    p_id: targetId,
    p_hidden: hidden,
  });
  if (error) return { ok: false, error: NOT_ALLOWED };

  revalidateDiscussions(discussionId);
  return { ok: true };
}

/** Resolves all open reports for a given thread or post. */
export async function resolveReport(
  type: "thread" | "post",
  targetId: string,
  discussionId?: string,
): Promise<ResolveResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if ((type !== "thread" && type !== "post") || !UUID.test(targetId)) {
    return { ok: false, error: NOT_ALLOWED };
  }

  const { error } = await supabase.rpc("resolve_discussion_reports", {
    p_type: type,
    p_id: targetId,
  });
  if (error) return { ok: false, error: NOT_ALLOWED };

  revalidateDiscussions(discussionId);
  return { ok: true };
}
