"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { getAdminUsers } from "./users";
import { validateOrganizationName, validateOrganizationSlug } from "./organizations";
import type { LearnerOption } from "./enrollment-actions";

export type OrgActionResult = { ok: true } | { ok: false; error: string };
export type CreateOrgResult = { ok: true; id: string } | { ok: false; error: string };

async function actor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Any user matching the search, regardless of role — an org member can be a learner, instructor, etc. */
export async function searchOrgCandidatesAction(q: string): Promise<LearnerOption[]> {
  const { supabase, user } = await actor();
  if (!user) return [];
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const { users } = await getAdminUsers(supabase, { q: trimmed, role: "", status: "", page: 1 });
  return users.map((u) => ({ userId: u.userId, fullName: u.fullName, email: u.email }));
}

export async function createOrganizationAction(input: { name: string; slug: string }): Promise<CreateOrgResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const name = validateOrganizationName(input.name);
  if (!name.ok) return name;
  const slug = validateOrganizationSlug(input.slug);
  if (!slug.ok) return slug;

  const { data, error } = await supabase.from("organizations").insert({ name: name.value, slug: slug.value }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "An organization with that slug already exists." };
    return { ok: false, error: "We could not create that organization. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.created",
    resourceType: "organization",
    resourceId: data.id as string,
    metadata: { name: name.value, slug: slug.value },
  });

  revalidatePath("/admin/organizations");
  return { ok: true, id: data.id as string };
}

export async function renameOrganizationAction(orgId: string, name: string): Promise<OrgActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const parsed = validateOrganizationName(name);
  if (!parsed.ok) return parsed;

  const { error } = await supabase.from("organizations").update({ name: parsed.value }).eq("id", orgId);
  if (error) return { ok: false, error: "We could not save that organization. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.updated",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { name: parsed.value },
  });

  revalidatePath(`/admin/organizations/${orgId}`);
  return { ok: true };
}

export async function deleteOrganizationAction(orgId: string): Promise<OrgActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("organizations").delete().eq("id", orgId);
  if (error) return { ok: false, error: "We could not delete that organization. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.deleted",
    resourceType: "organization",
    resourceId: orgId,
  });

  revalidatePath("/admin/organizations");
  return { ok: true };
}

export async function addOrganizationMemberAction(orgId: string, userId: string, orgRole: "org_admin" | "member"): Promise<OrgActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { error } = await supabase.from("organization_members").insert({ organization_id: orgId, user_id: userId, org_role: orgRole });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That person already belongs to an organization." };
    return { ok: false, error: "We could not add that member. Please try again." };
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.member_added",
    resourceType: "organization",
    resourceId: orgId,
    metadata: { userId, orgRole },
  });

  revalidatePath(`/admin/organizations/${orgId}`);
  return { ok: true };
}

export async function removeOrganizationMemberAction(memberId: string): Promise<OrgActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data, error } = await supabase.from("organization_members").delete().eq("id", memberId).select("organization_id").single();
  if (error) return { ok: false, error: "We could not remove that member. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.member_removed",
    resourceType: "organization",
    resourceId: data.organization_id as string,
    metadata: { memberId },
  });

  revalidatePath(`/admin/organizations/${data.organization_id as string}`);
  return { ok: true };
}

export async function setOrganizationMemberRoleAction(memberId: string, orgRole: "org_admin" | "member"): Promise<OrgActionResult> {
  const { supabase, user } = await actor();
  if (!user) return { ok: false, error: "Please log in again." };

  const { data, error } = await supabase.from("organization_members").update({ org_role: orgRole }).eq("id", memberId).select("organization_id").single();
  if (error) return { ok: false, error: "We could not update that member. Please try again." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action: "organization.member_role_changed",
    resourceType: "organization",
    resourceId: data.organization_id as string,
    metadata: { memberId, orgRole },
  });

  revalidatePath(`/admin/organizations/${data.organization_id as string}`);
  return { ok: true };
}
