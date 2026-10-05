import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPricingForEditing } from "@/features/course-authoring/pricing";
import { parseCatalogFilters } from "@/features/catalog/filters";
import { getCourseDetail } from "@/features/catalog/course-detail";
import { searchCourses } from "@/features/catalog/search-courses";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveCourseSettings } from "@/features/course-authoring/pricing-actions";
import { setCoursePriceAction } from "@/features/admin/course-price-actions";
import { enrollInCourse } from "@/features/enrollment/enroll";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const input = (over = {}) => ({
  certificateEnabled: true,
  visibility: "public",
  prerequisiteIds: [] as string[],
  ...over,
});

// F-202 course settings (instructor) and the platform-set price (admin, ADR-037): saved, enforced in
// the catalog and at enrollment (action AND RLS).
describe.skipIf(!hasLiveProject)("pricing & settings (T-055, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("pr");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const anon = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let admin: { id: string; client: SupabaseClient };
  let a: Awaited<ReturnType<typeof createCourse>>; // course being configured (draft)
  let b: Awaited<ReturnType<typeof createCourse>>; // published prerequisite
  let c: Awaited<ReturnType<typeof createCourse>>; // published course that requires b
  let foreign: Awaited<ReturnType<typeof createCourse>>;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = anon();
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    admin = await user("adm", "admin");
    a = await createCourse(svc, owner.id, { slug: `${tag}-a`, title: `${tag} A`, publish: false });
    b = await createCourse(svc, owner.id, { slug: `${tag}-b`, title: `${tag} Basics`, publish: true });
    c = await createCourse(svc, owner.id, { slug: `${tag}-c`, title: `${tag} Advanced`, publish: true });
    foreign = await createCourse(svc, other.id, { slug: `${tag}-f`, title: `${tag} foreign`, publish: false });
    courseIds.push(a.courseId, b.courseId, c.courseId, foreign.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  describe("saving", () => {
    it("saves the certificate switch and visibility, and never touches the price", async () => {
      currentClient = owner.client;
      await svc.from("course_versions").update({ price_cents: 2500, currency: "GBP" }).eq("id", a.versionId);
      expect(await saveCourseSettings(a.courseId, input({ certificateEnabled: false, visibility: "unlisted", mode: "paid", amount: "1", priceCents: 1 }))).toEqual({ ok: true });
      const { data } = await svc.from("course_versions").select("price_cents, currency, certificate_enabled, visibility").eq("id", a.versionId).single();
      expect(data).toEqual({ price_cents: 2500, currency: "GBP", certificate_enabled: false, visibility: "unlisted" });
      const back = await getPricingForEditing(owner.client, owner.id, a.courseId, a.versionId);
      expect(back).toMatchObject({ priceCents: 2500, currency: "GBP", certificateEnabled: false, visibility: "unlisted", prerequisiteIds: [] });
      await saveCourseSettings(a.courseId, input());
      await svc.from("course_versions").update({ price_cents: 0, currency: "USD" }).eq("id", a.versionId);
    });

    it("validates input with field errors", async () => {
      currentClient = owner.client;
      const r = await saveCourseSettings(a.courseId, input({ visibility: "secret" }));
      expect(r).toMatchObject({ ok: false, fieldErrors: { visibility: expect.any(String) } });
    });

    it("stores prerequisites, replaces them on re-save, and only allows own other courses", async () => {
      currentClient = owner.client;
      expect(await saveCourseSettings(a.courseId, input({ prerequisiteIds: [b.courseId] }))).toEqual({ ok: true });
      let { data } = await svc.from("course_prerequisites").select("prerequisite_course_id").eq("version_id", a.versionId);
      expect(data!.map((r) => r.prerequisite_course_id)).toEqual([b.courseId]);
      expect(await saveCourseSettings(a.courseId, input({ prerequisiteIds: [c.courseId] }))).toEqual({ ok: true });
      ({ data } = await svc.from("course_prerequisites").select("prerequisite_course_id").eq("version_id", a.versionId));
      expect(data!.map((r) => r.prerequisite_course_id)).toEqual([c.courseId]);

      const bad = { ok: false, fieldErrors: { prerequisiteIds: "Choose prerequisites from your other courses." } };
      expect(await saveCourseSettings(a.courseId, input({ prerequisiteIds: [foreign.courseId] }))).toMatchObject(bad);
      expect(await saveCourseSettings(a.courseId, input({ prerequisiteIds: [a.courseId] }))).toMatchObject(bad);
      await saveCourseSettings(a.courseId, input({ prerequisiteIds: [] }));
    });

    it("rejects prerequisite loops", async () => {
      currentClient = owner.client;
      // c requires b; making b require c would loop.
      await svc.from("course_prerequisites").insert({ version_id: c.versionId, prerequisite_course_id: b.courseId });
      await svc.from("course_versions").update({ status: "draft" }).eq("id", b.versionId);
      const r = await saveCourseSettings(b.courseId, input({ prerequisiteIds: [c.courseId] }));
      expect(r).toMatchObject({ ok: false, fieldErrors: { prerequisiteIds: expect.stringContaining("loop") } });
      await svc.from("course_versions").update({ status: "published" }).eq("id", b.versionId);
    });

    it("is refused for other instructors and learners, and while locked", async () => {
      const denied = { ok: false, error: "This course is not available." };
      for (const who of [other, learner]) {
        currentClient = who.client;
        expect(await saveCourseSettings(a.courseId, input({ visibility: "unlisted" }))).toEqual(denied);
      }
      currentClient = owner.client;
      await svc.from("course_versions").update({ status: "in_review" }).eq("id", a.versionId);
      expect(await saveCourseSettings(a.courseId, input())).toEqual({ ok: false, error: "This course is locked while it is in review or published." });
      await svc.from("course_versions").update({ status: "draft" }).eq("id", a.versionId);
    });

    it("the instructor cannot write privileged columns directly: status, nor price (ADR-037)", async () => {
      const { error } = await owner.client.from("course_versions").update({ status: "published" }).eq("id", a.versionId);
      expect(error).not.toBeNull();
      const price = await owner.client.from("course_versions").update({ price_cents: 4999 }).eq("id", a.versionId);
      expect(price.error).not.toBeNull();
      const cur = await owner.client.from("course_versions").update({ currency: "EUR" }).eq("id", a.versionId);
      expect(cur.error).not.toBeNull();
      const rpc = await owner.client.rpc("admin_set_course_price", { p_course_id: a.courseId, p_price_cents: 4999, p_currency: "USD" });
      expect(rpc.error?.code).toBe("42501");
      const { data } = await svc.from("course_versions").select("price_cents, currency").eq("id", a.versionId).single();
      expect(data).toEqual({ price_cents: 0, currency: "USD" });
    });
  });

  describe("platform price (admin, ADR-037)", () => {
    it("an admin sets the price for every version of a course, audited", async () => {
      currentClient = admin.client;
      expect(await setCoursePriceAction(c.courseId, { mode: "paid", amount: "49.99", currency: "EUR" })).toEqual({ ok: true });
      const { data } = await svc.from("course_versions").select("price_cents, currency").eq("course_id", c.courseId);
      expect(data!.length).toBeGreaterThan(0);
      for (const v of data!) expect(v).toEqual({ price_cents: 4999, currency: "EUR" });
      const { data: audit } = await svc
        .from("audit_logs")
        .select("actor_id, metadata")
        .eq("action", "course.price_changed")
        .eq("resource_id", c.courseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      expect(audit).toMatchObject({ actor_id: admin.id, metadata: { price_cents: 4999, currency: "EUR" } });

      expect(await setCoursePriceAction(c.courseId, { mode: "free", amount: "", currency: "EUR" })).toEqual({ ok: true });
      const { data: free } = await svc.from("course_versions").select("price_cents").eq("course_id", c.courseId);
      for (const v of free!) expect(v.price_cents).toBe(0);
    });

    it("rejects an invalid price, and refuses instructors and learners", async () => {
      currentClient = admin.client;
      expect(await setCoursePriceAction(c.courseId, { mode: "paid", amount: "0.10", currency: "XXX" })).toMatchObject({
        ok: false,
        fieldErrors: { amount: expect.any(String), currency: expect.any(String) },
      });
      for (const who of [owner, learner]) {
        currentClient = who.client;
        expect(await setCoursePriceAction(c.courseId, { mode: "paid", amount: "5", currency: "USD" })).toEqual({
          ok: false,
          error: "You do not have permission to change course prices.",
        });
      }
    });
  });

  describe("visibility", () => {
    it("hides unlisted courses from catalog search but keeps them reachable by URL", async () => {
      await svc.from("course_versions").update({ visibility: "unlisted" }).eq("id", b.versionId);
      const found = await searchCourses(anon(), { ...parseCatalogFilters({}), q: tag });
      expect(found.courses.map((x) => x.slug)).toEqual([`${tag}-c`]);
      expect((await getCourseDetail(anon(), `${tag}-b`))?.title).toBe(`${tag} Basics`);
      await svc.from("course_versions").update({ visibility: "public" }).eq("id", b.versionId);
      const again = await searchCourses(anon(), { ...parseCatalogFilters({}), q: tag });
      expect(again.courses.map((x) => x.slug).sort()).toEqual([`${tag}-b`, `${tag}-c`]);
    });
  });

  describe("prerequisites at enrollment", () => {
    it("shows the prerequisites on the public course detail", async () => {
      const detail = await getCourseDetail(anon(), `${tag}-c`);
      expect(detail!.prerequisites).toEqual([{ id: b.courseId, title: `${tag} Basics` }]);
    });

    it("blocks the enroll action until the prerequisite is completed", async () => {
      currentClient = learner.client;
      expect(await enrollInCourse(`${tag}-c`)).toEqual({ error: `Complete these courses first: ${tag} Basics.` });
      const { count } = await svc.from("enrollments").select("id", { count: "exact", head: true }).eq("user_id", learner.id).eq("course_id", c.courseId);
      expect(count).toBe(0);
    });

    it("blocks a direct API insert too (RLS), so the UI is not the only guard", async () => {
      const { error } = await learner.client.from("enrollments").insert({ user_id: learner.id, course_id: c.courseId, version_id: c.versionId });
      expect(error).not.toBeNull();
    });

    it("an in-progress (not completed) prerequisite is not enough", async () => {
      currentClient = learner.client;
      await svc.from("enrollments").insert({ user_id: learner.id, course_id: b.courseId, version_id: b.versionId, status: "active" });
      expect(await enrollInCourse(`${tag}-c`)).toMatchObject({ error: expect.stringContaining("Complete these courses first") });
    });

    it("allows enrollment once the prerequisite is completed", async () => {
      currentClient = learner.client;
      await svc.from("enrollments").update({ status: "completed", completed_at: new Date().toISOString() }).eq("user_id", learner.id).eq("course_id", b.courseId);
      expect(await enrollInCourse(`${tag}-c`)).toEqual({ enrolled: true });
    });

    it("does not affect courses without prerequisites", async () => {
      const free = await createCourse(svc, owner.id, { slug: `${tag}-free`, title: `${tag} Free` });
      courseIds.push(free.courseId);
      const fresh = await user("fresh", "learner");
      currentClient = fresh.client;
      expect(await enrollInCourse(`${tag}-free`)).toEqual({ enrolled: true });
    });
  });
});
