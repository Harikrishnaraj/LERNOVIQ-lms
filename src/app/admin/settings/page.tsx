import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PlatformSettingsForm } from "@/components/admin/platform-settings-form";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getRecentSecurityEvents } from "@/features/admin/platform-settings";
import { getPlatformSettings } from "@/services/settings";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "settings.manage"))) {
    return (
      <>
        <PageHeader title="Settings" />
        <PermissionDeniedState title="You cannot manage platform settings" description="Ask an administrator if you need access." />
      </>
    );
  }

  const [settings, events] = await Promise.all([getPlatformSettings(supabase), getRecentSecurityEvents(supabase)]);

  return (
    <>
      <PageHeader title="Settings" description="Password, MFA and session policy for the whole platform." />
      <div className="space-y-10">
        <section aria-labelledby="policy-heading" className="space-y-4">
          <h2 id="policy-heading" className="text-base font-semibold">
            Security policy
          </h2>
          <PlatformSettingsForm settings={settings} />
        </section>

        <section aria-labelledby="events-heading" className="space-y-3">
          <h2 id="events-heading" className="text-base font-semibold">
            Security events
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-text-secondary">No security events yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle rounded-card border border-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div>
                    <p className="font-medium">{e.action}</p>
                    <p className="text-xs text-text-secondary">{e.actorEmail ?? "system"}</p>
                  </div>
                  <span className="text-xs text-text-secondary">{dateFormat.format(new Date(e.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
