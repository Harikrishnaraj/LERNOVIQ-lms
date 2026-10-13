"use server";

import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit, type AuditAction } from "@/services/audit";
import { searchDispatchableCourses, type DispatchableCourse } from "./queries";
import {
  parseOrigins,
  validateClientName,
  validateContactEmail,
  validateExpiry,
  validateLicenceName,
  validateNotes,
  validateSeatLimit,
} from "./rules";

// Admin Content Server actions (T-171, F-520, ADR-038). Every write is checked by RLS
// (content_server.manage) and audited (SECURITY §27).

export type ActionResult = { ok: true } | { ok: false; error: string };
export type CreateResult = { ok: true; id: string } | { ok: false; error: string };

const DENIED = {
  ok: false as const,
  error: "You do not have permission to manage the content server.",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function manager() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, allowed: false };
  return { supabase, user, allowed: await can(supabase, user.id, "content_server.manage") };
}

async function audit(
  user: { id: string; email?: string | null },
  action: AuditAction,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email ?? null,
    action,
    resourceType,
    resourceId,
    metadata,
  });
}

const clientPath = (clientId: string) => `/admin/content-server/${clientId}`;

export async function createContentClientAction(input: {
  name: string;
  contactEmail?: string;
}): Promise<CreateResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  const name = validateClientName(input.name);
  if (!name.ok) return name;
  const email = validateContactEmail(input.contactEmail);
  if (!email.ok) return email;

  const { data, error } = await supabase
    .from("content_clients")
    .insert({ name: name.value, contact_email: email.value, created_by: user.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "A customer with that name already exists." };
    return { ok: false, error: "We could not add that customer. Please try again." };
  }
  await audit(user, "content_client.created", "content_client", data.id as string, {
    name: name.value,
  });
  revalidatePath("/admin/content-server");
  return { ok: true, id: data.id as string };
}

export async function updateContentClientAction(
  clientId: string,
  input: { name: string; contactEmail?: string; notes?: string },
): Promise<ActionResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (!UUID.test(clientId)) return { ok: false, error: "That customer no longer exists." };
  const name = validateClientName(input.name);
  if (!name.ok) return name;
  const email = validateContactEmail(input.contactEmail);
  if (!email.ok) return email;
  const notes = validateNotes(input.notes);
  if (!notes.ok) return notes;

  const { error } = await supabase
    .from("content_clients")
    .update({ name: name.value, contact_email: email.value, notes: notes.value })
    .eq("id", clientId);
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "A customer with that name already exists." };
    return { ok: false, error: "We could not save that customer. Please try again." };
  }
  await audit(user, "content_client.updated", "content_client", clientId, { name: name.value });
  revalidatePath(clientPath(clientId));
  return { ok: true };
}

export async function deleteContentClientAction(clientId: string): Promise<ActionResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (!UUID.test(clientId)) return { ok: false, error: "That customer no longer exists." };
  const { data: client } = await supabase
    .from("content_clients")
    .select("name")
    .eq("id", clientId)
    .maybeSingle();
  const { error } = await supabase.from("content_clients").delete().eq("id", clientId);
  if (error) return { ok: false, error: "We could not delete that customer. Please try again." };
  await audit(user, "content_client.deleted", "content_client", clientId, {
    name: client?.name ?? null,
  });
  revalidatePath("/admin/content-server");
  return { ok: true };
}

export interface LicenceInput {
  name: string;
  seatLimit: string;
  expiresOn: string;
  allowedOrigins: string;
}

function parseLicence(input: LicenceInput) {
  const name = validateLicenceName(input.name);
  if (!name.ok) return name;
  const seats = validateSeatLimit(input.seatLimit);
  if (!seats.ok) return seats;
  const expiry = validateExpiry(input.expiresOn);
  if (!expiry.ok) return expiry;
  const origins = parseOrigins(input.allowedOrigins);
  if (!origins.ok) return origins;
  return {
    ok: true as const,
    value: {
      name: name.value,
      seat_limit: seats.value,
      expires_at: expiry.value,
      allowed_origins: origins.value,
    },
  };
}

export async function createLicenceAction(
  clientId: string,
  input: LicenceInput,
): Promise<CreateResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (!UUID.test(clientId)) return { ok: false, error: "That customer no longer exists." };
  const parsed = parseLicence(input);
  if (!parsed.ok) return parsed;

  const { data, error } = await supabase
    .from("content_licences")
    .insert({ client_id: clientId, ...parsed.value, created_by: user.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: "We could not create that licence. Please try again." };
  await audit(user, "content_licence.created", "content_licence", data.id as string, {
    client_id: clientId,
    ...parsed.value,
  });
  revalidatePath(clientPath(clientId));
  return { ok: true, id: data.id as string };
}

export async function updateLicenceAction(
  clientId: string,
  licenceId: string,
  input: LicenceInput,
): Promise<ActionResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (!UUID.test(clientId) || !UUID.test(licenceId))
    return { ok: false, error: "That licence no longer exists." };
  const parsed = parseLicence(input);
  if (!parsed.ok) return parsed;

  const { data, error } = await supabase
    .from("content_licences")
    .update(parsed.value)
    .eq("id", licenceId)
    .eq("client_id", clientId)
    .select("id");
  if (error) return { ok: false, error: "We could not save that licence. Please try again." };
  if (!data?.length) return { ok: false, error: "That licence no longer exists." };
  await audit(user, "content_licence.updated", "content_licence", licenceId, {
    client_id: clientId,
    ...parsed.value,
  });
  revalidatePath(clientPath(clientId));
  return { ok: true };
}

/** Revoke stops new launches and content loads at once (SECURITY §27); reinstating undoes it. */
export async function setLicenceRevokedAction(
  clientId: string,
  licenceId: string,
  revoked: boolean,
): Promise<ActionResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (!UUID.test(clientId) || !UUID.test(licenceId))
    return { ok: false, error: "That licence no longer exists." };
  const { data, error } = await supabase
    .from("content_licences")
    .update(
      revoked
        ? { revoked_at: new Date().toISOString(), revoked_by: user.id }
        : { revoked_at: null, revoked_by: null },
    )
    .eq("id", licenceId)
    .eq("client_id", clientId)
    .select("id");
  if (error) return { ok: false, error: "We could not change that licence. Please try again." };
  if (!data?.length) return { ok: false, error: "That licence no longer exists." };
  await audit(
    user,
    revoked ? "content_licence.revoked" : "content_licence.reinstated",
    "content_licence",
    licenceId,
    { client_id: clientId },
  );
  revalidatePath(clientPath(clientId));
  return { ok: true };
}

export async function searchDispatchableCoursesAction(q: string): Promise<DispatchableCourse[]> {
  const { supabase, user, allowed } = await manager();
  if (!user || !allowed) return [];
  try {
    return await searchDispatchableCourses(supabase, q);
  } catch {
    return [];
  }
}

export async function addLicenceCourseAction(
  clientId: string,
  licenceId: string,
  courseId: string,
): Promise<ActionResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (![clientId, licenceId, courseId].every((id) => UUID.test(id)))
    return { ok: false, error: "That course is not available." };
  // Only courses that can actually be dispatched (published, with a SCORM 1.2 lesson) may be added.
  const { data: dispatchable } = await supabase.rpc("content_course_is_dispatchable", {
    p_course_id: courseId,
  });
  if (dispatchable !== true)
    return { ok: false, error: "Only published courses with a SCORM 1.2 lesson can be added." };
  const { data: licence } = await supabase
    .from("content_licences")
    .select("id")
    .eq("id", licenceId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!licence) return { ok: false, error: "That licence no longer exists." };
  const { error } = await supabase
    .from("content_licence_courses")
    .insert({ licence_id: licenceId, course_id: courseId });
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "That course is already on this licence." };
    return { ok: false, error: "We could not add that course. Please try again." };
  }
  await audit(user, "content_licence.course_added", "content_licence", licenceId, {
    client_id: clientId,
    course_id: courseId,
  });
  revalidatePath(clientPath(clientId));
  return { ok: true };
}

/** Removing a course deletes its dispatch, so zips already handed out stop working (ADR-038). */
export async function removeLicenceCourseAction(
  clientId: string,
  licenceId: string,
  courseId: string,
): Promise<ActionResult> {
  const { supabase, user, allowed } = await manager();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!allowed) return DENIED;
  if (![clientId, licenceId, courseId].every((id) => UUID.test(id)))
    return { ok: false, error: "That course is not on this licence." };
  const { data: licence } = await supabase
    .from("content_licences")
    .select("id")
    .eq("id", licenceId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (!licence) return { ok: false, error: "That licence no longer exists." };
  const { error } = await supabase
    .from("content_licence_courses")
    .delete()
    .eq("licence_id", licenceId)
    .eq("course_id", courseId);
  if (error) return { ok: false, error: "We could not remove that course. Please try again." };
  await audit(user, "content_licence.course_removed", "content_licence", licenceId, {
    client_id: clientId,
    course_id: courseId,
  });
  revalidatePath(clientPath(clientId));
  return { ok: true };
}
