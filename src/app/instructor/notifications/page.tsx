import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationsView } from "@/components/notifications/notifications-view";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <NotificationsView portal="instructor" userId={user.id} searchParams={await searchParams} />;
}
