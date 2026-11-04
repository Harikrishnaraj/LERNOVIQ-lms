import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "@/services/storage";

// T-294, T-300 (F-448): remove storage objects whose account or assignment no longer exists.
// The database lists them (orphaned_storage_objects); removal goes through the Storage API.
export async function removeOrphanedStorage(
  admin: SupabaseClient,
  storage: Pick<StorageAdapter, "remove">,
  limit = 500,
): Promise<{ removed: number; failed: number }> {
  const { data, error } = await admin.rpc("orphaned_storage_objects", { p_limit: limit });
  if (error) throw new Error(`orphaned_storage_objects failed: ${error.message}`);
  const byBucket = new Map<string, string[]>();
  for (const row of (data ?? []) as { bucket_id: string; name: string }[]) {
    byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
  }
  let removed = 0;
  let failed = 0;
  for (const [bucket, paths] of byBucket) {
    try {
      await storage.remove(bucket, paths);
      removed += paths.length;
    } catch {
      // Left for the next run; one bad bucket must not stop the others.
      failed += paths.length;
    }
  }
  return { removed, failed };
}
