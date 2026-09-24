import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createPath, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getPath, listPaths } from "@/features/paths/paths";
import { enrollInPath, leavePath } from "@/features/paths/path-actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-111: path catalog, ordered detail, follow/leave, and progress from real enrollments.
describe.skipIf(!hasLiveProject)("learning paths (T-080, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("lp");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const pathIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let learner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let c1: Awaited<ReturnType<typeof createCourse>>;
  let c2: Awaited<ReturnType<typeof createCourse>>;
  let c3: Awaited<ReturnType<typeof createCourse>>;
  let draftCourse: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, "learner");
    learnerIds.push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    learner = await user("lrn");
    other = await user("oth");
    const ins = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    userIds.push(ins.id);
    c1 = await createCourse(svc, ins.id, { slug: `${tag}-c1`, title: `${tag} One`, publish: true });
    c2 = await createCourse(svc, ins.id, { slug: `${tag}-c2`, title: `${tag} Two`, publish: true });
    c3 = await createCourse(svc, ins.id, { slug: `${tag}-c3`, title: `${tag} Three`, publish: true });
    draftCourse = await createCourse(svc, ins.id, { slug: `${tag}-dr`, title: `${tag} Unpublished`, publish: false });
    courseIds.push(c1.courseId, c2.courseId, c3.courseId, draftCourse.courseId);
    const path = await createPath(svc, { slug: `${tag}-path`, title: `${tag} Path`, description: "Learn in order", courseIds: [c2.courseId, draftCourse.courseId, c1.courseId, c3.courseId] });
    const hidden = await createPath(svc, { slug: `${tag}-hidden`, title: `${tag} Hidden`, status: "draft", courseIds: [c1.courseId] });
    pathIds.push(path.pathId, hidden.pathId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds, pathIds }), 120_000);

  it("lists published paths only, with course counts (unpublished courses are not counted)", async () => {
    const list = await listPaths(learner.client);
    const mine = list.filter((p) => p.slug.startsWith(tag));
    expect(mine.map((p) => p.slug)).toEqual([`${tag}-path`]);
    expect(mine[0]).toMatchObject({ courseCount: 3, completedCount: 0, enrolled: false });
  });

  it("shows the path courses in path order and hides unpublished courses and draft paths", async () => {
    const path = await getPath(learner.client, `${tag}-path`);
    expect(path).toMatchObject({ title: `${tag} Path`, description: "Learn in order", enrolled: false });
    expect(path!.courses.map((c) => c.slug)).toEqual([`${tag}-c2`, `${tag}-c1`, `${tag}-c3`]);
    expect(path!.courses.every((c) => c.status === "not_started")).toBe(true);
    expect(await getPath(learner.client, `${tag}-hidden`)).toBeNull();
    expect(await getPath(learner.client, "Not A Slug!")).toBeNull();
    expect(await getPath(learner.client, "nope-nope")).toBeNull();
  });

  it("follow is idempotent, stores only the caller's enrollment, and leave undoes it", async () => {
    currentClient = learner.client;
    expect(await enrollInPath(`${tag}-path`)).toEqual({ ok: true });
    expect(await enrollInPath(`${tag}-path`)).toEqual({ ok: true });
    const { data } = await svc.from("path_enrollments").select("user_id").eq("path_id", pathIds[0]);
    expect(data).toEqual([{ user_id: learner.id }]);
    expect((await getPath(learner.client, `${tag}-path`))!.enrolled).toBe(true);
    expect((await getPath(other.client, `${tag}-path`))!.enrolled).toBe(false);
    expect((await listPaths(learner.client)).find((p) => p.slug === `${tag}-path`)!.enrolled).toBe(true);

    expect(await leavePath(`${tag}-path`)).toEqual({ ok: true });
    expect((await getPath(learner.client, `${tag}-path`))!.enrolled).toBe(false);
  });

  it("refuses draft and unknown paths, and RLS blocks enrolling someone else or in a draft path", async () => {
    currentClient = learner.client;
    expect(await enrollInPath(`${tag}-hidden`)).toEqual({ ok: false, error: "This path is not available." });
    expect(await enrollInPath("Bad Slug")).toEqual({ ok: false, error: "This path is not available." });
    const forOther = await learner.client.from("path_enrollments").insert({ user_id: other.id, path_id: pathIds[0] });
    expect(forOther.error).not.toBeNull();
    const intoDraft = await learner.client.from("path_enrollments").insert({ user_id: learner.id, path_id: pathIds[1] });
    expect(intoDraft.error).not.toBeNull();
  });

  it("progress follows real course enrollments", async () => {
    await svc.from("enrollments").insert([
      { user_id: learner.id, course_id: c2.courseId, version_id: c2.versionId, status: "completed", completed_at: new Date().toISOString() },
      { user_id: learner.id, course_id: c1.courseId, version_id: c1.versionId, status: "active" },
    ]);
    const path = await getPath(learner.client, `${tag}-path`);
    expect(path!.courses.map((c) => [c.slug.replace(`${tag}-`, ""), c.status])).toEqual([
      ["c2", "completed"],
      ["c1", "active"],
      ["c3", "not_started"],
    ]);
    const summary = (await listPaths(learner.client)).find((p) => p.slug === `${tag}-path`)!;
    expect(summary).toMatchObject({ courseCount: 3, completedCount: 1 });
    // Another learner's progress is separate.
    expect((await getPath(other.client, `${tag}-path`))!.courses.every((c) => c.status === "not_started")).toBe(true);
  });

  it("is not available to anonymous callers", async () => {
    await expect(listPaths(anon())).rejects.toThrow();
    await expect(getPath(anon(), `${tag}-path`)).rejects.toThrow();
  });
});
