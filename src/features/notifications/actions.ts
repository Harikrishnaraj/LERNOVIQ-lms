"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isCategory } from "./notifications";

export type NotificationResult = { ok: true } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAILED = "We could not update your notifications. Please try again.";

async function authed() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function refresh() {
  revalidatePath("/learner", "layout");
  revalidatePath("/instructor", "layout");
}

export async function markRead(id: string, read = true): Promise<NotificationResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(id)) return { ok: false, error: FAILED };
  const { error } = await supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, error: FAILED };
  refresh();
  return { ok: true };
}

export async function markAllRead(): Promise<NotificationResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) return { ok: false, error: FAILED };
  refresh();
  return { ok: true };
}

export async function deleteNotification(id: string): Promise<NotificationResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!UUID.test(id)) return { ok: false, error: FAILED };
  const { error } = await supabase.from("notifications").delete().eq("id", id);
  if (error) return { ok: false, error: FAILED };
  refresh();
  return { ok: true };
}

export async function setPreference(category: string, inApp: boolean): Promise<NotificationResult> {
  const { supabase, user } = await authed();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!isCategory(category) || typeof inApp !== "boolean") return { ok: false, error: FAILED };
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: user.id, category, in_app: inApp }, { onConflict: "user_id,category" });
  if (error) return { ok: false, error: FAILED };
  revalidatePath("/learner/notifications");
  revalidatePath("/instructor/notifications");
  return { ok: true };
}
