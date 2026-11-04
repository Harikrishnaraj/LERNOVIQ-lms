import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { removeOrphanedStorage } from "@/features/privacy/storage-cleanup";

// F-448 (T-294, T-300): orphaned files are removed per bucket; a failing bucket does not block the rest.
function admin(rows: { bucket_id: string; name: string }[]) {
  return { rpc: async () => ({ data: rows, error: null }) } as unknown as SupabaseClient;
}

describe("removeOrphanedStorage", () => {
  it("groups paths by bucket and removes them", async () => {
    const calls: [string, string[]][] = [];
    const out = await removeOrphanedStorage(
      admin([
        { bucket_id: "avatars", name: "u1/a.png" },
        { bucket_id: "assignment-submissions", name: "a1/u1/f.pdf" },
        { bucket_id: "avatars", name: "u1/b.png" },
      ]),
      { remove: async (b, p) => void calls.push([b, p]) },
    );
    expect(calls).toEqual([
      ["avatars", ["u1/a.png", "u1/b.png"]],
      ["assignment-submissions", ["a1/u1/f.pdf"]],
    ]);
    expect(out).toEqual({ removed: 3, failed: 0 });
  });

  it("counts a failed bucket and carries on", async () => {
    const out = await removeOrphanedStorage(
      admin([
        { bucket_id: "avatars", name: "u1/a.png" },
        { bucket_id: "assignment-submissions", name: "a1/u1/f.pdf" },
      ]),
      { remove: async (b) => { if (b === "avatars") throw new Error("down"); } },
    );
    expect(out).toEqual({ removed: 1, failed: 1 });
  });

  it("throws when the listing fails", async () => {
    const bad = { rpc: async () => ({ data: null, error: { message: "no" } }) } as unknown as SupabaseClient;
    await expect(removeOrphanedStorage(bad, { remove: async () => {} })).rejects.toThrow("no");
  });
});
