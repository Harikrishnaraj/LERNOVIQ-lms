"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PathResult = { ok: true } | { ok: false; error: string };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Follow a published path. Idempotent: following twice is fine. RLS also enforces own user + published. */
export async function enrollInPath(slug: string): Promise<PathResult> {
  if (!SLUG.test(slug)) return { ok: false, error: "This path is not available." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data: path } = await supabase.from("learning_paths").select("id").eq("slug", slug).eq("status", "published").maybeSingle();
  if (!path) return { ok: false, error: "This path is not available." };

  const { error } = await supabase.from("path_enrollments").upsert(
    { user_id: user.id, path_id: path.id },
    { onConflict: "user_id,path_id", ignoreDuplicates: true },
  );
  if (error) return { ok: false, error: "We could not follow this path. Please try again." };
  revalidatePath("/learner/paths");
  revalidatePath(`/learner/paths/${slug}`);
  return { ok: true };
}

/** Stop following a path. Course enrollments and progress are untouched. */
export async function leavePath(slug: string): Promise<PathResult> {
  if (!SLUG.test(slug)) return { ok: false, error: "This path is not available." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  const { data: path } = await supabase.from("learning_paths").select("id").eq("slug", slug).maybeSingle();
  if (!path) return { ok: false, error: "This path is not available." };
  const { error } = await supabase.from("path_enrollments").delete().eq("user_id", user.id).eq("path_id", path.id);
  if (error) return { ok: false, error: "We could not update this path. Please try again." };
  revalidatePath("/learner/paths");
  revalidatePath(`/learner/paths/${slug}`);
  return { ok: true };
}
