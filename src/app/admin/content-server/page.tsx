import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContentClientList } from "@/components/admin/content-client-list";
import { PermissionDeniedState } from "@/components/feedback/states";
import { ContentOriginNotice } from "@/components/admin/content-origin-notice";
import { PageHeader } from "@/components/layout/page-header";
import { listContentClients } from "@/features/content-server/queries";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { dispatchContentOrigin } from "@/services/content-server";

export const metadata: Metadata = { title: "Content Server" };

// T-171 (F-520, ADR-038): customers that run their own LMS and the licences they hold.
export default async function AdminContentServerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "content_server.manage"))) {
    return (
      <>
        <PageHeader title="Content Server" />
        <PermissionDeniedState
          title="You cannot manage the content server"
          description="Ask an administrator if you need access."
        />
      </>
    );
  }

  const clients = await listContentClients(supabase);

  return (
    <>
      <PageHeader
        title="Content Server"
        description="Let customers run your SCORM courses inside their own LMS. Progress is tracked in their LMS; LERNOVIQ checks the licence on every launch."
      />
      {!dispatchContentOrigin() && <ContentOriginNotice />}
      <ContentClientList clients={clients} />
    </>
  );
}
