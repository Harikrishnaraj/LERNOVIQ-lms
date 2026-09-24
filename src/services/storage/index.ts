import { createAdminClient } from "@/services/supabase/admin";

/**
 * Storage adapter (ADR-014): the rest of the app depends on this interface, so the provider
 * (Supabase Storage today) can be swapped without touching feature code. Server-only: it uses
 * the service role, so callers must have authenticated and validated the request first.
 */
export interface StorageAdapter {
  /** Stores the bytes and returns a public URL (public buckets only). */
  uploadPublic(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  remove(bucket: string, paths: string[]): Promise<void>;
  /** One-time token for the browser to upload straight to storage (bypasses the Next server). */
  createSignedUpload(bucket: string, path: string): Promise<{ path: string; token: string }>;
  /** Short-lived download URL for a private object. */
  createSignedUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string>;
  /** Whether an object exists at `path` (used to verify a completed direct upload). */
  exists(bucket: string, path: string): Promise<boolean>;
}

export const THUMBNAIL_BUCKET = "course-thumbnails";
export const VIDEO_BUCKET = "course-videos";
export const ASSET_BUCKET = "lesson-assets";
export const SUBMISSION_BUCKET = "assignment-submissions";

export const supabaseStorage: StorageAdapter = {
  async uploadPublic(bucket, path, bytes, contentType) {
    const admin = createAdminClient();
    const { error } = await admin.storage.from(bucket).upload(path, bytes, {
      contentType,
      upsert: false,
      cacheControl: "31536000", // immutable: every upload gets a unique path
    });
    if (error) throw new Error(`storage upload failed: ${error.message}`);
    return admin.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  async remove(bucket, paths) {
    if (paths.length === 0) return;
    const { error } = await createAdminClient().storage.from(bucket).remove(paths);
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  },

  async createSignedUpload(bucket, path) {
    const { data, error } = await createAdminClient().storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`signed upload failed: ${error?.message}`);
    return { path: data.path, token: data.token };
  },

  async createSignedUrl(bucket, path, expiresInSeconds) {
    const { data, error } = await createAdminClient().storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
    return data.signedUrl;
  },

  async exists(bucket, path) {
    const i = path.lastIndexOf("/");
    const { data } = await createAdminClient()
      .storage.from(bucket)
      .list(i === -1 ? "" : path.slice(0, i), { search: path.slice(i + 1), limit: 1 });
    return (data ?? []).some((o) => o.name === path.slice(i + 1));
  },
};
