import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrganizationDetailPanel } from "@/components/admin/organization-detail-panel";
import { PermissionDeniedState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { getOrganizationDetail, getOrganizationMembers } from "@/features/admin/organizations";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Organization" };

export default async function AdminOrganizationDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!(await can(supabase, user.id, "organizations.manage"))) {
    return (
      <>
        <PageHeader title="Organization" />
        <PermissionDeniedState title="You cannot manage organizations" description="Ask an administrator if you need access." />
      </>
    );
  }

  const org = await getOrganizationDetail(supabase, orgId);
  if (!org) notFound();
  const members = await getOrganizationMembers(supabase, orgId);

  return (
    <>
      <PageHeader
        title={org.name}
        description={`${org.memberCount} ${org.memberCount === 1 ? "member" : "members"}`}
        actions={
          <Link href="/admin/organizations" className="text-sm text-primary hover:underline">
            ← Back to organizations
          </Link>
        }
      />
      <OrganizationDetailPanel org={org} members={members} />
    </>
  );
}
