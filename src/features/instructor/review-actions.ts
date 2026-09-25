"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const replySchema = z.object({
  reviewId: z.string().uuid("Invalid review ID"),
  replyText: z
    .string()
    .trim()
    .min(1, "Reply cannot be empty")
    .max(2000, "Reply cannot exceed 2000 characters"),
});

const deleteSchema = z.object({
  reviewId: z.string().uuid("Invalid review ID"),
});

export async function replyToReviewAction(
  formData: { reviewId: string; replyText: string } | FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const raw =
      formData instanceof FormData
        ? {
            reviewId: formData.get("reviewId"),
            replyText: formData.get("replyText"),
          }
        : formData;

    const parsed = replySchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Unauthorized" };
    }

    const { error } = await supabase.rpc("reply_to_course_review", {
      p_rating_id: parsed.data.reviewId,
      p_reply: parsed.data.replyText,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/instructor/reviews");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to post reply",
    };
  }
}

export async function deleteReviewReplyAction(
  formData: { reviewId: string } | FormData,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const raw =
      formData instanceof FormData
        ? {
            reviewId: formData.get("reviewId"),
          }
        : formData;

    const parsed = deleteSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid review ID",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { ok: false, error: "Unauthorized" };
    }

    const { error } = await supabase.rpc("delete_course_review_reply", {
      p_rating_id: parsed.data.reviewId,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    revalidatePath("/instructor/reviews");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete reply",
    };
  }
}
