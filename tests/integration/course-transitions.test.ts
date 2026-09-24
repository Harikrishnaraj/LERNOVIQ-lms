import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { transitionCourse } from "@/features/courses/transition";
import { bulkTransition, decideCourse } from "@/features/courses/transition-actions";
import { getAdminCourses } from "@/features/admin/courses";
import { searchCourses } from "@/features/catalog/search-courses";
import { parseCatalogFilters } from "@/features/catalog/filters";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-405 / F-406 / F-310: reviewer decisions, the state machine, atomicity, audit and visibility.
describe.skipIf(!hasLiveProject)("course transitions (T-072, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("tr");
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

  async function submitted(slug: string) {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-${slug}`, title: `${tag} ${slug}`, publish: false });
    courseIds.push(c.courseId);
    await svc.from("course_versions").update({ status: "submitted" }).eq("id", c.versionId);
    return c;
  }
  const status = async (versionId: string) =>
    (await svc.from("course_versions").select("status").eq("id", versionId).single()).data!.status;

  beforeAll(async () => {
    adminUser = await user("adm", "admin");
    reviewer = await user("rev", "content_reviewer");
    support = await user("sup", "support_agent");
    instructor = await user("ins", "instructor");
    learner = await user("lrn", "learner");
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  it("walks the full happy path: review, approve, publish (live in the catalog), archive (gone)", async () => {
    const c = await submitted("happy");
    expect(await transitionCourse(reviewer.client, c.courseId, "start_review", "")).toEqual({ ok: true, to: "in_review" });
    expect(await transitionCourse(reviewer.client, c.courseId, "approve", "Looks good")).toEqual({ ok: true, to: "approved" });
    expect(await status(c.versionId)).toBe("approved");

    // Approved is not live yet.
    expect((await searchCourses(anon(), { ...parseCatalogFilters({}), q: tag })).courses.map((x) => x.slug)).not.toContain(`${tag}-happy`);

    expect(await transitionCourse(adminUser.client, c.courseId, "publish", "")).toEqual({ ok: true, to: "published" });
    const { data: course } = await svc.from("courses").select("published_version_id").eq("id", c.courseId).single();
    expect(course!.published_version_id).toBe(c.versionId);
    expect((await searchCourses(anon(), { ...parseCatalogFilters({}), q: tag })).courses.map((x) => x.slug)).toContain(`${tag}-happy`);

    expect(await transitionCourse(adminUser.client, c.courseId, "archive", "")).toEqual({ ok: true, to: "archived" });
    expect((await svc.from("courses").select("published_version_id").eq("id", c.courseId).single()).data!.published_version_id).toBeNull();
    expect((await searchCourses(anon(), { ...parseCatalogFilters({}), q: tag })).courses.map((x) => x.slug)).not.toContain(`${tag}-happy`);

    const { data: history } = await svc.from("course_reviews").select("action, from_status, to_status, actor_id").eq("version_id", c.versionId).order("created_at");
    expect(history!.map((h) => h.action)).toEqual(["start_review", "approve", "publish", "archive"]);
    expect(history![1]).toMatchObject({ from_status: "in_review", to_status: "approved", actor_id: reviewer.id });
  });

  it("audits every decision", async () => {
    const c = await submitted("audit");
    await transitionCourse(reviewer.client, c.courseId, "start_review", "");
    await transitionCourse(reviewer.client, c.courseId, "reject", "Not suitable");
    const { data } = await svc.from("audit_logs").select("action, actor_id, metadata").eq("resource_id", c.courseId).order("created_at");
    expect(data!.map((a) => a.action)).toEqual(["course.review_started", "course.rejected"]);
    expect(data![1]).toMatchObject({ actor_id: reviewer.id, metadata: expect.objectContaining({ from: "in_review", to: "rejected", hasNote: true }) });
  });

  it("requires a note to request changes or reject, and stores it", async () => {
    const c = await submitted("note");
    await transitionCourse(reviewer.client, c.courseId, "start_review", "");
    expect(await transitionCourse(reviewer.client, c.courseId, "request_changes", " ")).toEqual({ ok: false, error: "Tell the instructor why: add a short note." });
    expect(await status(c.versionId)).toBe("in_review");
    expect(await transitionCourse(reviewer.client, c.courseId, "request_changes", "Add more examples")).toEqual({ ok: true, to: "changes_requested" });
    const { data } = await svc.from("course_reviews").select("note").eq("version_id", c.versionId).eq("action", "request_changes");
    expect(data).toEqual([{ note: "Add more examples" }]);
    // The instructor can read the feedback on their own course; the editor unlocks again.
    const mine = await instructor.client.from("course_reviews").select("note").eq("version_id", c.versionId);
    expect(mine.data!.map((r) => r.note)).toContain("Add more examples");
  });

  it("refuses illegal transitions and changes nothing", async () => {
    const c = await submitted("illegal");
    for (const action of ["approve", "publish", "archive", "reject"] as const) {
      const r = await transitionCourse(reviewer.client, c.courseId, action, "because");
      expect(r.ok).toBe(false);
    }
    expect(await status(c.versionId)).toBe("submitted");
    const { count } = await svc.from("course_reviews").select("id", { count: "exact", head: true }).eq("version_id", c.versionId);
    expect(count).toBe(0);
  });

  it("checks permission on the server: instructors, learners and support agents are refused", async () => {
    const c = await submitted("perm");
    for (const who of [instructor, learner, support]) {
      expect(await transitionCourse(who.client, c.courseId, "start_review", "")).toEqual({ ok: false, error: "You do not have permission to review courses." });
    }
    expect(await status(c.versionId)).toBe("submitted");
    // The server action wrapper refuses unknown actions too.
    currentClient = reviewer.client;
    expect(await decideCourse(c.courseId, "delete_everything", "")).toEqual({ ok: false, error: "Unknown action." });
  });

  it("the service-role RPC cannot be called by a reviewer through the API", async () => {
    const c = await submitted("rpc");
    const { error } = await reviewer.client.rpc("apply_course_transition", {
      p_version_id: c.versionId, p_from: "submitted", p_to: "published", p_actor: reviewer.id, p_action: "publish", p_note: "",
    });
    expect(error).not.toBeNull();
    expect(await status(c.versionId)).toBe("submitted");
  });

  it("two reviewers acting at once: exactly one wins", async () => {
    const c = await submitted("race");
    const results = await Promise.all([
      transitionCourse(reviewer.client, c.courseId, "start_review", ""),
      transitionCourse(adminUser.client, c.courseId, "start_review", ""),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await status(c.versionId)).toBe("in_review");
  });

  it("publishing a new version archives the previously live one", async () => {
    const c = await createCourse(svc, instructor.id, { slug: `${tag}-v2`, title: `${tag} v2`, publish: true });
    courseIds.push(c.courseId);
    const { data: v2 } = await svc.from("course_versions").insert({ course_id: c.courseId, version_number: 2, title: `${tag} v2 new`, status: "approved" }).select("id").single();
    expect(await transitionCourse(adminUser.client, c.courseId, "publish", "")).toEqual({ ok: true, to: "published" });
    expect(await status(c.versionId)).toBe("archived");
    expect((await svc.from("courses").select("published_version_id").eq("id", c.courseId).single()).data!.published_version_id).toBe(v2!.id);
  });

  it("lets a rejected course be reopened as a draft", async () => {
    const c = await submitted("reopen");
    await transitionCourse(reviewer.client, c.courseId, "start_review", "");
    await transitionCourse(reviewer.client, c.courseId, "reject", "Off topic");
    expect(await transitionCourse(reviewer.client, c.courseId, "reopen", "")).toEqual({ ok: true, to: "draft" });
  });

  it("bulk: applies per course, reports failures, and rejects unsafe actions and empty input", async () => {
    const a = await submitted("bulk-a");
    const b = await submitted("bulk-b");
    await svc.from("course_versions").update({ status: "draft" }).eq("id", b.versionId);
    currentClient = reviewer.client;
    const r = await bulkTransition([a.courseId, b.courseId, a.courseId], "start_review");
    expect(r).toMatchObject({ done: 1 });
    expect((r as { failed: unknown[] }).failed).toHaveLength(1);
    expect(await status(a.versionId)).toBe("in_review");
    expect(await status(b.versionId)).toBe("draft");
    expect(await bulkTransition([a.courseId], "approve")).toEqual({ error: "That action cannot be applied to many courses at once." });
    expect(await bulkTransition([], "archive")).toEqual({ error: "Select at least one course." });
  });

  it("admin_courses lists every course for read_all roles only", async () => {
    const c = await submitted("list");
    const rows = await getAdminCourses(support.client);
    const row = rows.find((r) => r.courseId === c.courseId);
    expect(row).toMatchObject({ title: `${tag} list`, status: "submitted", instructorId: instructor.id });
    expect(row!.instructorEmail).toContain("@");
    await expect(getAdminCourses(instructor.client)).rejects.toThrow();
    await expect(getAdminCourses(learner.client)).rejects.toThrow();
  });
});

// F-310: the DB copy of the state machine must equal the TypeScript one, and the RPC enforces it.
import { COURSE_STATUSES, nextCourseStatus, allowedCourseActions } from "@/features/courses/course-status";

describe.skipIf(!hasLiveProject)("course state machine in the database (T-074, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);

  it("course_status_transitions equals the TypeScript state machine", async () => {
    const { data } = await svc.from("course_status_transitions").select("from_status, action, to_status");
    const db = (data ?? []).map((r) => `${r.from_status}|${r.action}|${r.to_status}`).sort();
    const ts = COURSE_STATUSES.flatMap((from) =>
      allowedCourseActions(from).map((action) => `${from}|${action}|${nextCourseStatus(from, action)}`),
    ).sort();
    expect(db).toEqual(ts);
  });

  it("apply_course_transition refuses an illegal triple even from the service role", async () => {
    const tag = uniqueTag("dbm");
    const u = await createUserWithRole(svc, `${tag}-ins`, "instructor");
    const c = await createCourse(svc, u.id, { slug: `${tag}-c`, title: `${tag} c`, publish: false });
    try {
      const { data, error } = await svc.rpc("apply_course_transition", {
        p_version_id: c.versionId, p_from: "draft", p_to: "published", p_actor: u.id, p_action: "publish", p_note: "",
      });
      expect(error).toBeNull();
      expect(data).toBe(false);
      const { data: v } = await svc.from("course_versions").select("status").eq("id", c.versionId).single();
      expect(v!.status).toBe("draft");
    } finally {
      await cleanup(svc, { learnerIds: [], courseIds: [c.courseId], userIds: [u.id] });
    }
  });
});
