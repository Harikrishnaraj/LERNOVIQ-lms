"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { can } from "@/lib/permissions/can";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/services/audit";
import { clientIp, rateLimit, RATE_LIMITED_MESSAGE } from "@/services/rate-limit";
import { KNOWLEDGE_DOCUMENT_BUCKET, supabaseStorage } from "@/services/storage";
import { createAdminClient } from "@/services/supabase/admin";
import {
  documentStoragePath,
  documentTitle,
  isDocumentStoragePath,
  isUuid,
  SNIFF_BYTES,
  sniffDocument,
  validateDocumentFile,
  type DocumentFormat,
} from "./document-rules";

// Admin Knowledge Base mutations (T-221, T-223; F-800, F-802). Each action authenticates, checks
// `knowledge.manage`, validates its input, and only then uses the service role (the knowledge
// tables and bucket grant clients nothing). Every change is audited (SECURITY §17).

export type KnowledgeActionResult = { ok: true } | { ok: false; error: string };
export type KnowledgeUploadTicket =
  | { ok: true; bucket: string; path: string; token: string; contentType: string }
  | { ok: false; error: string };

export interface DocumentUploadInput {
  name: unknown;
  size: unknown;
  type: unknown;
  title: unknown;
  /** Organization id, or "" / null for a platform-wide document. */
  organizationId: unknown;
}

const PAGE = "/admin/knowledge";

type Actor = { id: string; email: string | null };

async function authorize(): Promise<{ ok: true; actor: Actor } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please log in again." };
  if (!(await can(supabase, user.id, "knowledge.manage"))) {
    return { ok: false, error: "You do not have permission to manage the knowledge base." };
  }
  return { ok: true, actor: { id: user.id, email: user.email ?? null } };
}

/** Platform-wide (null) or an existing organization's id; anything else is refused. */
async function resolveScope(
  organizationId: unknown,
): Promise<{ ok: true; organizationId: string | null } | { ok: false; error: string }> {
  if (organizationId === null || organizationId === undefined || organizationId === "") {
    return { ok: true, organizationId: null };
  }
  if (!isUuid(organizationId)) return { ok: false, error: "Choose a valid organization." };
  const { data } = await createAdminClient()
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  return data
    ? { ok: true, organizationId }
    : { ok: false, error: "That organization no longer exists." };
}

function checkInput(input: DocumentUploadInput) {
  const file = validateDocumentFile(input);
  if (!file.ok) return file;
  const title = documentTitle(input.title, file.fileName);
  if (!title) return { ok: false as const, error: "Enter a title of up to 300 characters." };
  return { ...file, title };
}

/** Step 1: validate the file and issue a one-time direct-to-storage upload ticket. */
export async function requestKnowledgeUpload(
  input: DocumentUploadInput,
): Promise<KnowledgeUploadTicket> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!(await rateLimit("ai-ingest", await clientIp(), auth.actor.id))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }
  const check = checkInput(input);
  if (!check.ok) return check;
  const scope = await resolveScope(input.organizationId);
  if (!scope.ok) return scope;

  const path = documentStoragePath(scope.organizationId, randomUUID(), check.format);
  try {
    const { token } = await supabaseStorage.createSignedUpload(KNOWLEDGE_DOCUMENT_BUCKET, path);
    return {
      ok: true,
      bucket: KNOWLEDGE_DOCUMENT_BUCKET,
      path,
      token,
      contentType: check.mimeType,
    };
  } catch {
    return { ok: false, error: "We could not start the upload. Please try again." };
  }
}

/**
 * Step 2, after the browser uploaded: check the stored bytes really are the claimed format
 * (magic bytes / UTF-8), then create the pending source and its indexing job.
 */
export async function registerKnowledgeDocument(
  input: DocumentUploadInput & { path: unknown },
): Promise<KnowledgeActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  const check = checkInput(input);
  if (!check.ok) return check;
  const scope = await resolveScope(input.organizationId);
  if (!scope.ok) return scope;
  // Only a path this action could have issued for this scope and format (never another object).
  if (!isDocumentStoragePath(input.path, scope.organizationId, check.format)) {
    return { ok: false, error: "That upload is not valid. Please upload the file again." };
  }
  const path = input.path;

  const sniffed = await sniffStored(path, check.format);
  if (sniffed === "missing") {
    return { ok: false, error: "The upload did not complete. Please try again." };
  }
  if (sniffed === "mismatch") {
    await supabaseStorage.remove(KNOWLEDGE_DOCUMENT_BUCKET, [path]).catch(() => {});
    return {
      ok: false,
      error: `The file's contents are not a valid ${check.format.toUpperCase()} document. Check the file and try again.`,
    };
  }

  const { data: sourceId, error } = await createAdminClient().rpc("create_document_source", {
    p_title: check.title,
    p_organization_id: scope.organizationId,
    p_storage_path: path,
    p_mime_type: check.mimeType,
    p_byte_size: input.size,
    p_file_name: check.fileName,
    p_created_by: auth.actor.id,
  });
  if (error || !sourceId) {
    return { ok: false, error: "We could not save that document. Please try again." };
  }

  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "knowledge.document_uploaded",
    resourceType: "knowledge_source",
    resourceId: sourceId as string,
    metadata: {
      title: check.title,
      fileName: check.fileName,
      mimeType: check.mimeType,
      byteSize: input.size,
      organizationId: scope.organizationId,
    },
  });
  revalidatePath(PAGE);
  return { ok: true };
}

async function sniffStored(
  path: string,
  format: DocumentFormat,
): Promise<"ok" | "missing" | "mismatch"> {
  let head: Uint8Array;
  try {
    head = await supabaseStorage.readHeader(KNOWLEDGE_DOCUMENT_BUCKET, path, SNIFF_BYTES);
  } catch {
    return "missing";
  }
  return sniffDocument(head, format) ? "ok" : "mismatch";
}

/** Re-index a lesson or document source: its text is extracted and chunked again. */
export async function reindexKnowledgeSource(sourceId: unknown): Promise<KnowledgeActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!isUuid(sourceId)) return { ok: false, error: "Source not found." };
  if (!(await rateLimit("ai-ingest", await clientIp(), auth.actor.id))) {
    return { ok: false, error: RATE_LIMITED_MESSAGE };
  }

  const { data, error } = await createAdminClient().rpc("requeue_knowledge_source", {
    p_source_id: sourceId,
  });
  if (error) return { ok: false, error: "We could not re-index that source. Please try again." };
  if (data === "not_found") return { ok: false, error: "Source not found." };
  if (data === "running") {
    return { ok: false, error: "This source is being indexed right now. Try again in a minute." };
  }

  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "knowledge.source_reindexed",
    resourceType: "knowledge_source",
    resourceId: sourceId,
  });
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Delete an uploaded document: its chunks and jobs go with it (FK cascade), so it disappears from
 * retrieval at once, and its file is removed from storage. Lesson sources cannot be deleted here:
 * the indexer recreates them for every published lesson (re-index them instead).
 */
export async function deleteKnowledgeDocument(sourceId: unknown): Promise<KnowledgeActionResult> {
  const auth = await authorize();
  if (!auth.ok) return auth;
  if (!isUuid(sourceId)) return { ok: false, error: "Document not found." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("knowledge_sources")
    .delete()
    .eq("id", sourceId)
    .eq("kind", "document")
    .select("title, storage_path, organization_id");
  if (error) return { ok: false, error: "We could not delete that document. Please try again." };
  const deleted = (data ?? [])[0] as
    | { title: string; storage_path: string | null; organization_id: string | null }
    | undefined;
  if (!deleted) return { ok: false, error: "Document not found." };

  if (deleted.storage_path) {
    await supabaseStorage
      .remove(KNOWLEDGE_DOCUMENT_BUCKET, [deleted.storage_path])
      .catch(() => {});
  }
  await recordAudit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "knowledge.document_deleted",
    resourceType: "knowledge_source",
    resourceId: sourceId,
    metadata: { title: deleted.title, organizationId: deleted.organization_id },
  });
  revalidatePath(PAGE);
  return { ok: true };
}
