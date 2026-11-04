import { afterAll, describe, expect, it } from "vitest";
import { createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";
import { removeOrphanedStorage } from "@/features/privacy/storage-cleanup";
import { supabaseStorage } from "@/services/storage";

const hasLiveProject = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// F-448 (T-294): a deleted account's avatar is listed as orphaned and removed; a live account's is kept.
describe.skipIf(!hasLiveProject)("orphaned storage cleanup (live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("orph");
  let live: { id: string } | null = null;
  let livePath = "";

  afterAll(async () => {
    if (livePath) await svc.storage.from("avatars").remove([livePath]);
    if (live) await svc.auth.admin.deleteUser(live.id);
  });

  it("removes files of deleted accounts only", async () => {
    const gone = await createUserWithRole(svc, `${tag}-gone`, "learner");
    live = await createUserWithRole(svc, `${tag}-live`, "learner");
    const gonePath = `${gone.id}/${tag}.png`;
    livePath = `${live.id}/${tag}.png`;
    for (const p of [gonePath, livePath]) {
      const { error } = await svc.storage.from("avatars").upload(p, new Uint8Array([137, 80, 78, 71]), { contentType: "image/png" });
      expect(error).toBeNull();
    }
    await svc.auth.admin.deleteUser(gone.id);

    const { data } = await svc.rpc("orphaned_storage_objects", { p_limit: 1000 });
    const names = ((data ?? []) as { name: string }[]).map((r) => r.name);
    expect(names).toContain(gonePath);
    expect(names).not.toContain(livePath);

    await removeOrphanedStorage(svc, supabaseStorage, 1000);
    expect((await svc.storage.from("avatars").list(gone.id)).data ?? []).toEqual([]);
    expect(((await svc.storage.from("avatars").list(live.id)).data ?? []).length).toBe(1);
  }, 120_000);
});
