import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAdminOverview, getPendingReviews, getRecentActivity, describeAction } from "@/features/admin/overview";
import { recordAudit } from "@/services/audit";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-400: the admin overview reads real platform data and only for back-office roles.
describe.skipIf(!hasLiveProject)("admin overview (T-071, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("ao");
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const courseIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let adminUser: { id: string; client: SupabaseClient };
  let reviewer: { id: string; client: SupabaseClient };
  let support: { id: string; client: SupabaseClient };
  let instructor: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    adminUser = await user("adm", "admin");
    reviewer = await user("rev", "content_reviewer");
    support = await user("sup", "support_agent");
    instructor = await user("ins", "instructor");
    learner = await user("lrn", "learner");
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("returns platform counts to back-office roles", async () => {
    const before = await getAdminOverview(adminUser.client);
    expect(before.usersTotal).toBeGreaterThanOrEqual(5);
    expect(before.instructors).toBeGreaterThanOrEqual(1);
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-c`, title: `${tag} Pending`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    const after = await getAdminOverview(reviewer.client);
    // Other suites change global counts concurrently, so only a lower bound is stable.
    expect(after.coursesPendingReview).toBeGreaterThanOrEqual(1);
    expect((await getAdminOverview(support.client)).usersTotal).toBeGreaterThan(0);
  });

  it("refuses learners and instructors", async () => {
    await expect(getAdminOverview(learner.client)).rejects.toThrow();
    await expect(getAdminOverview(instructor.client)).rejects.toThrow();
    await expect(getAdminOverview(anon())).rejects.toThrow();
  });

  it("lists submitted courses in the review queue for reviewers, oldest first", async () => {
    const queue = await getPendingReviews(reviewer.client, 50);
    expect(queue.some((q) => q.title === `${tag} Pending` && q.status === "submitted")).toBe(true);
    const dates = queue.map((q) => q.updatedAt);
    expect([...dates].sort()).toEqual(dates);
    expect(await getPendingReviews(learner.client)).toEqual([]);
  });

  it("shows recent audit activity only to audit readers", async () => {
    const resourceId = `${tag}-act`;
    await recordAudit({ actorId: adminUser.id, actorEmail: "boss@example.com", action: "course.approved", resourceType: "course", resourceId });
    const feed = await getRecentActivity(adminUser.client, 20);
    expect(feed.find((a) => a.resourceId === resourceId)).toMatchObject({ action: "course.approved", actorEmail: "boss@example.com" });
    expect(await getRecentActivity(reviewer.client)).toEqual([]);
  });

  it("describes actions in words", () => {
    expect(describeAction("course.changes_requested")).toBe("Course changes requested");
  });
});
