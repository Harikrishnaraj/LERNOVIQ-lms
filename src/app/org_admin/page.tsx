import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OrganizationDetailPanel } from "@/components/admin/organization-detail-panel";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getMyOrganizationId, getOrganizationDetail, getOrganizationMembers } from "@/features/admin/organizations";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Organization" };

export default async function OrgAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const orgId = await getMyOrganizationId(supabase);
  if (!orgId) {
    return (
      <>
        <PageHeader title="My Organization" />
        <EmptyState title="Not assigned to an organization yet" description="Ask a platform administrator to add you as a member." />
      </>
    );
  }

  const org = await getOrganizationDetail(supabase, orgId);
  if (!org) {
    return (
      <>
        <PageHeader title="My Organization" />
        <EmptyState title="Organization not found" description="Ask a platform administrator to check your membership." />
      </>
    );
  }
  const members = await getOrganizationMembers(supabase, orgId);

  return (
    <>
      <PageHeader title={org.name} description={`${org.memberCount} ${org.memberCount === 1 ? "member" : "members"}`} />
      <OrganizationDetailPanel org={org} members={members} />
    </>
  );
}
