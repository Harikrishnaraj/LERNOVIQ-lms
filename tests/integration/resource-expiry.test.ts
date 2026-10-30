import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAssetLinks } from "@/features/player/media";
import { ASSET_BUCKET } from "@/services/storage";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

const DAY = 86_400_000;

// F-430: resource library expiry (T-279), live Supabase.
describe.skipIf(!hasLiveProject)("resource library expiry (T-279, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("resexp");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const storagePaths: string[] = [];

  let instructor: SupabaseClient;
  let learner: SupabaseClient;
  let instructorId: string;
  let learnerId: string;
  let lessonId: string;
  let activeResourceId: string;
  let expiredResourceId: string;
  let activeAssetId: string;
  let expiredAssetId: string;

  async function signIn(email: string, password: string) {
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return client;
  }

  async function makeAsset(name: string) {
    const path = `${tag}/${name}.txt`;
    await svc.storage.from(ASSET_BUCKET).upload(path, new TextEncoder().encode(name), { contentType: "text/plain" });
    storagePaths.push(path);
    const { data, error } = await svc
      .from("lesson_assets")
      .insert({ lesson_id: lessonId, name, storage_path: path, mime_type: "text/plain", size_bytes: name.length })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  }

  beforeAll(async () => {
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    instructorId = ins.id;
    userIds.push(ins.id);
    instructor = await signIn(ins.email, ins.password);

    const course = await createCourse(svc, ins.id, {
      slug: `${tag}-course`,
      title: `${tag} Course`,
      publish: true,
      sections: [{ title: "S1", lessons: [{ title: "L1", minutes: 5 }] }],
    });
    courseIds.push(course.courseId);
    lessonId = course.lessonIds[0];

    const lrn = await createUserWithRole(svc, `${tag}-lrn`, "learner");
    learnerId = lrn.id;
    learnerIds.push(lrn.id);
    learner = await signIn(lrn.email, lrn.password);
    await svc.from("enrollments").insert({ user_id: lrn.id, course_id: course.courseId, version_id: course.versionId });

    const { data: items, error } = await svc
      .from("resource_library_items")
      .insert([
        { owner_id: ins.id, name: `${tag}-active`, storage_path: `${ins.id}/${tag}-a.txt`, expires_at: new Date(Date.now() + 60 * DAY).toISOString() },
        { owner_id: ins.id, name: `${tag}-expired`, storage_path: `${ins.id}/${tag}-e.txt`, expires_at: new Date(Date.now() - DAY).toISOString() },
      ])
      .select("id, name");
    if (error) throw error;
    activeResourceId = items!.find((i) => i.name.endsWith("active"))!.id;
    expiredResourceId = items!.find((i) => i.name.endsWith("expired"))!.id;

    activeAssetId = await makeAsset("active");
    expiredAssetId = await makeAsset("expired");
  }, 200_000);

  afterAll(async () => {
    if (storagePaths.length) await svc.storage.from(ASSET_BUCKET).remove(storagePaths);
    await svc.from("resource_library_items").delete().eq("owner_id", instructorId);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  it("refuses to attach an expired resource, however the request arrives", async () => {
    const { error } = await instructor.from("resource_library_usages").insert({ resource_id: expiredResourceId, lesson_asset_id: expiredAssetId });
    expect(error?.message).toMatch(/resource expired/);
  });

  it("attaches a resource that has not expired", async () => {
    const { error } = await instructor.from("resource_library_usages").insert({ resource_id: activeResourceId, lesson_asset_id: activeAssetId });
    expect(error).toBeNull();
  });

  it("lists expiry dates in the owner's library", async () => {
    const { data } = await instructor.rpc("instructor_resource_library", { p_query: tag });
    const byName = new Map((data as { name: string; expires_at: string | null }[]).map((r) => [r.name, r.expires_at]));
    expect(byName.get(`${tag}-active`)).not.toBeNull();
    expect(new Date(byName.get(`${tag}-expired`)!).getTime()).toBeLessThan(Date.now());
  });

  it("lets the owner change only the expiry, not the file or name", async () => {
    const ok = await instructor.from("resource_library_items").update({ expires_at: null }).eq("id", expiredResourceId);
    expect(ok.error).toBeNull();
    const rename = await instructor.from("resource_library_items").update({ name: "renamed" }).eq("id", expiredResourceId);
    expect(rename.error).not.toBeNull();
    // Put it back so the learner-facing test below has an expired resource.
    await svc.from("resource_library_items").update({ expires_at: new Date(Date.now() - DAY).toISOString() }).eq("id", expiredResourceId);
  });

  it("hides an attachment from the learner once its resource has expired, and logs the attempt", async () => {
    // The expired item was attached while still valid, then ran out.
    await svc.from("resource_library_items").update({ expires_at: new Date(Date.now() + DAY).toISOString() }).eq("id", expiredResourceId);
    const { error } = await svc.from("resource_library_usages").insert({ resource_id: expiredResourceId, lesson_asset_id: expiredAssetId });
    expect(error).toBeNull();

    // Both attachments are visible while neither resource has expired.
    expect((await getAssetLinks(learner, lessonId, learnerId)).map((l) => l.id).sort()).toEqual([activeAssetId, expiredAssetId].sort());

    await svc.from("resource_library_items").update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq("id", expiredResourceId);
    const links = await getAssetLinks(learner, lessonId, learnerId);
    expect(links.map((l) => l.id)).toEqual([activeAssetId]);

    const { data: audit } = await svc
      .from("audit_logs")
      .select("actor_id, metadata")
      .eq("action", "resource.expired_access_refused")
      .eq("resource_id", lessonId);
    expect(audit?.length).toBeGreaterThanOrEqual(1);
    expect(audit![0].actor_id).toBe(learnerId);
    expect(JSON.stringify(audit![0].metadata)).toContain(expiredAssetId);
  });
});
