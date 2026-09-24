import { createAdminClient } from "@/services/supabase/admin";

/**
 * Storage adapter (ADR-014): the rest of the app depends on this interface, so the provider
 * (Supabase Storage today) can be swapped without touching feature code. Server-only: it uses
 * the service role, so callers must have authenticated and validated the upload first.
 */
export interface StorageAdapter {
  /** Stores the bytes and returns a public URL (public buckets only). */
  uploadPublic(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<string>;
  remove(bucket: string, paths: string[]): Promise<void>;
}

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
};

export const THUMBNAIL_BUCKET = "course-thumbnails";
