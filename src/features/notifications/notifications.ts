import type { SupabaseClient } from "@supabase/supabase-js";

export const CATEGORIES = ["course", "assignment", "discussion", "review", "system"] as const;
export type NotificationCategory = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<NotificationCategory, { label: string; description: string }> = {
  course: { label: "Courses", description: "Certificates and course updates." },
  assignment: { label: "Assignments", description: "Grades and feedback on your work." },
  discussion: { label: "Discussions", description: "Replies to your discussions." },
  review: { label: "Course reviews", description: "Decisions on courses you submitted." },
  system: { label: "Account and system", description: "Important messages about your account." },
};

export const isCategory = (v: unknown): v is NotificationCategory => typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export const PAGE_SIZE = 20;

/** Same-origin relative paths only (never an external or protocol-relative link). */
export function safeHref(href: string | null | undefined): string | null {
  return href && href.startsWith("/") && !href.startsWith("//") ? href : null;
}

export async function getUnreadCount(supabase: SupabaseClient): Promise<number> {
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return count ?? 0;
}

export async function listNotifications(
  supabase: SupabaseClient,
  opts: { unreadOnly: boolean; page: number },
): Promise<{ items: NotificationItem[]; total: number }> {
  const start = (opts.page - 1) * PAGE_SIZE;
  let q = supabase
    .from("notifications")
    .select("id, category, title, body, href, read_at, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id")
    .range(start, start + PAGE_SIZE - 1);
  if (opts.unreadOnly) q = q.is("read_at", null);
  const { data, count, error } = await q;
  if (error?.code === "PGRST103") {
    let head = supabase.from("notifications").select("id", { count: "exact", head: true });
    if (opts.unreadOnly) head = head.is("read_at", null);
    return { items: [], total: (await head).count ?? 0 };
  }
  if (error) throw new Error(`notifications failed: ${error.message}`);
  return {
    total: count ?? 0,
    items: (data ?? []).map((n) => ({
      id: n.id as string,
      category: isCategory(n.category) ? n.category : "system",
      title: n.title as string,
      body: n.body as string,
      href: safeHref(n.href as string | null),
      read: n.read_at !== null,
      createdAt: n.created_at as string,
    })),
  };
}

/** Preference per category; anything never set defaults to on. */
export async function getPreferences(supabase: SupabaseClient, userId: string): Promise<Record<NotificationCategory, boolean>> {
  const { data } = await supabase.from("notification_preferences").select("category, in_app").eq("user_id", userId);
  const prefs = Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<NotificationCategory, boolean>;
  for (const row of data ?? []) if (isCategory(row.category)) prefs[row.category] = Boolean(row.in_app);
  return prefs;
}
