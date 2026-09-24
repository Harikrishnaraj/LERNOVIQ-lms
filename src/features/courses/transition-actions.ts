"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { transitionCourse, type TransitionResult } from "./transition";
import { BULK_ACTIONS, isReviewerAction } from "./transition-rules";

/** One reviewer decision on one course (used by the review screen). */
export async function decideCourse(courseId: string, action: string, note: string): Promise<TransitionResult> {
  if (!isReviewerAction(action)) return { ok: false, error: "Unknown action." };
  const result = await transitionCourse(await createClient(), courseId, action, note ?? "");
  if (result.ok) {
    revalidatePath("/admin/courses");
    revalidatePath(`/admin/courses/${courseId}`);
    revalidatePath("/admin");
  }
  return result;
}

export interface BulkResult {
  done: number;
  failed: { courseId: string; error: string }[];
}

const MAX_BULK = 50;

/** The same decision on several courses; each is checked and applied on its own. */
export async function bulkTransition(courseIds: string[], action: string): Promise<BulkResult | { error: string }> {
  if (!(BULK_ACTIONS as readonly string[]).includes(action) || !isReviewerAction(action)) {
    return { error: "That action cannot be applied to many courses at once." };
  }
  const ids = [...new Set(courseIds)];
  if (ids.length === 0) return { error: "Select at least one course." };
  if (ids.length > MAX_BULK) return { error: `Select at most ${MAX_BULK} courses at a time.` };

  const supabase = await createClient();
  const result: BulkResult = { done: 0, failed: [] };
  for (const id of ids) {
    const r = await transitionCourse(supabase, id, action, "");
    if (r.ok) result.done += 1;
    else result.failed.push({ courseId: id, error: r.error });
  }
  revalidatePath("/admin/courses");
  revalidatePath("/admin");
  return result;
}
