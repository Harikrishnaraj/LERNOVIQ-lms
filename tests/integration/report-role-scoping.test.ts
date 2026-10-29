import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getIdleUsers, getUserProgress } from "@/features/admin/user-reports";
import {
  getLibraryUsage,
  getLicenceStatusReport,
  getModuleUsage,
  getProductLibraryUsage,
  getProductModuleUsage,
} from "@/features/admin/usage-reports";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-422 (T-291): the platform-wide report RPCs answer only to analytics.read; every other role gets
// its own boundary (instructor: owned courses, org admin: own org, learner: own data).
describe.skipIf(!hasLiveProject)("report role scoping (T-291, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("rrs");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const orgIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });

  let admin: SupabaseClient;
  let instructor: SupabaseClient;
  let orgAdmin: SupabaseClient;
  let learnerA: { id: string; client: SupabaseClient };
  let learnerB: { id: string };
  let orgA: string;
  let orgB: string;
  let courseId: string;
  let lessonId: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    admin = (await user("adm", "admin")).client;
    const ins = await user("ins", "instructor");
    instructor = ins.client;
    const oa = await user("oa", "org_admin");
    orgAdmin = oa.client;
    learnerA = await user("la", "learner");
    learnerB = await user("lb", "learner");

    const course = await createCourse(svc, ins.id, { slug: `${tag}-c`, title: `${tag} C`, publish: true });
    courseId = course.courseId;
    lessonId = course.lessonIds[0];
    courseIds.push(courseId);
    for (const l of [learnerA, learnerB]) {
      const { data: e } = await svc.from("enrollments").insert({ user_id: l.id, course_id: courseId, version_id: course.versionId }).select("id").single();
      await svc.from("lesson_progress").insert({ enrollment_id: e!.id, lesson_id: lessonId });
    }

    const a = await svc.from("organizations").insert({ name: `${tag} A`, slug: `${tag}-a` }).select("id").single();
    const b = await svc.from("organizations").insert({ name: `${tag} B`, slug: `${tag}-b` }).select("id").single();
    orgA = a.data!.id;
    orgB = b.data!.id;
    orgIds.push(orgA, orgB);
    await svc.from("organization_members").insert({ organization_id: orgA, user_id: oa.id, org_role: "org_admin" });
  }, 200_000);

  afterAll(async () => {
    if (orgIds.length) await svc.from("organizations").delete().in("id", orgIds);
    await cleanup(svc, { learnerIds, courseIds, userIds });
  }, 120_000);

  const reports: [string, (c: SupabaseClient) => Promise<unknown>][] = [
    ["idle users", (c) => getIdleUsers(c, 30)],
    ["user progress", (c) => getUserProgress(c, 30)],
    ["module usage", (c) => getModuleUsage(c, 30)],
    ["product module usage", (c) => getProductModuleUsage(c)],
    ["library usage", (c) => getLibraryUsage(c, 30)],
    ["product library usage", (c) => getProductLibraryUsage(c)],
    ["licence status", (c) => getLicenceStatusReport(c)],
  ];

  it.each(reports)("%s: refused to instructor, org admin and learner, allowed to platform admin", async (_name, run) => {
    await expect(run(instructor)).rejects.toThrow(/not allowed/);
    await expect(run(orgAdmin)).rejects.toThrow(/not allowed/);
    await expect(run(learnerA.client)).rejects.toThrow(/not allowed/);
    await expect(run(admin)).resolves.toBeDefined();
  });

  it("a learner sees only their own lesson progress", async () => {
    const { data } = await learnerA.client.from("lesson_progress").select("enrollment_id, enrollments!inner(user_id)").eq("lesson_id", lessonId);
    expect(data).toHaveLength(1);
    expect((data![0] as unknown as { enrollments: { user_id: string } }).enrollments.user_id).toBe(learnerA.id);
  });

  it("an org admin cannot read another organization's assigned-learning report", async () => {
    const own = await orgAdmin.rpc("list_org_assigned_learning", { p_org_id: orgA });
    expect(own.error).toBeNull();
    const other = await orgAdmin.rpc("list_org_assigned_learning", { p_org_id: orgB });
    expect(other.error).not.toBeNull();
  });
});
