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

import { savePricing } from "@/features/course-authoring/pricing-actions";
import { enrollInCourse } from "@/features/enrollment/enroll";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const input = (over = {}) => ({
  mode: "free",
  amount: "",
  currency: "USD",
  certificateEnabled: true,
  visibility: "public",
  prerequisiteIds: [] as string[],
  ...over,
});

// F-202 pricing & settings: saved, enforced in the catalog and at enrollment (action AND RLS).
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
    a = await createCourse(svc, owner.id, { slug: `${tag}-a`, title: `${tag} A`, publish: false });
    b = await createCourse(svc, owner.id, { slug: `${tag}-b`, title: `${tag} Basics`, publish: true });
    c = await createCourse(svc, owner.id, { slug: `${tag}-c`, title: `${tag} Advanced`, publish: true });
    foreign = await createCourse(svc, other.id, { slug: `${tag}-f`, title: `${tag} foreign`, publish: false });
    courseIds.push(a.courseId, b.courseId, c.courseId, foreign.courseId);
  }, 200_000);

  afterAll(() => cleanup(svc, { learnerIds, courseIds, userIds }), 120_000);

  describe("saving", () => {
    it("saves a paid price in cents with currency, certificate switch and visibility", async () => {
      currentClient = owner.client;
      expect(await savePricing(a.courseId, input({ mode: "paid", amount: "49.99", currency: "EUR", certificateEnabled: false, visibility: "unlisted" }))).toEqual({ ok: true });
      const { data } = await svc.from("course_versions").select("price_cents, currency, certificate_enabled, visibility").eq("id", a.versionId).single();
      expect(data).toEqual({ price_cents: 4999, currency: "EUR", certificate_enabled: false, visibility: "unlisted" });
      const back = await getPricingForEditing(owner.client, owner.id, a.courseId, a.versionId);
      expect(back).toMatchObject({ priceCents: 4999, currency: "EUR", certificateEnabled: false, visibility: "unlisted", prerequisiteIds: [] });
      expect(back!.candidates.map((x) => x.id).sort()).toEqual([b.courseId, c.courseId].sort());
    });

    it("switching back to free zeroes the price", async () => {
      currentClient = owner.client;
      await savePricing(a.courseId, input({ mode: "free", amount: "99", visibility: "public" }));
      const { data } = await svc.from("course_versions").select("price_cents, visibility").eq("id", a.versionId).single();
      expect(data).toEqual({ price_cents: 0, visibility: "public" });
    });

    it("validates input with field errors and writes nothing", async () => {
      currentClient = owner.client;
      const r = await savePricing(a.courseId, input({ mode: "paid", amount: "0.10", currency: "XXX" }));
      expect(r).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String), currency: expect.any(String) } });
      const { data } = await svc.from("course_versions").select("price_cents").eq("id", a.versionId).single();
      expect(data!.price_cents).toBe(0);
    });

    it("stores prerequisites, replaces them on re-save, and only allows own other courses", async () => {
      currentClient = owner.client;
      expect(await savePricing(a.courseId, input({ prerequisiteIds: [b.courseId] }))).toEqual({ ok: true });
      let { data } = await svc.from("course_prerequisites").select("prerequisite_course_id").eq("version_id", a.versionId);
      expect(data!.map((r) => r.prerequisite_course_id)).toEqual([b.courseId]);
      expect(await savePricing(a.courseId, input({ prerequisiteIds: [c.courseId] }))).toEqual({ ok: true });
      ({ data } = await svc.from("course_prerequisites").select("prerequisite_course_id").eq("version_id", a.versionId));
      expect(data!.map((r) => r.prerequisite_course_id)).toEqual([c.courseId]);

      const bad = { ok: false, fieldErrors: { prerequisiteIds: "Choose prerequisites from your other courses." } };
      expect(await savePricing(a.courseId, input({ prerequisiteIds: [foreign.courseId] }))).toMatchObject(bad);
      expect(await savePricing(a.courseId, input({ prerequisiteIds: [a.courseId] }))).toMatchObject(bad);
      await savePricing(a.courseId, input({ prerequisiteIds: [] }));
    });

    it("rejects prerequisite loops", async () => {
      currentClient = owner.client;
      // c requires b; making b require c would loop.
      await svc.from("course_prerequisites").insert({ version_id: c.versionId, prerequisite_course_id: b.courseId });
      await svc.from("course_versions").update({ status: "draft" }).eq("id", b.versionId);
      const r = await savePricing(b.courseId, input({ prerequisiteIds: [c.courseId] }));
      expect(r).toMatchObject({ ok: false, fieldErrors: { prerequisiteIds: expect.stringContaining("loop") } });
      await svc.from("course_versions").update({ status: "published" }).eq("id", b.versionId);
    });

    it("is refused for other instructors and learners, and while locked", async () => {
      const denied = { ok: false, error: "This course is not available." };
      for (const who of [other, learner]) {
        currentClient = who.client;
        expect(await savePricing(a.courseId, input({ mode: "paid", amount: "5" }))).toEqual(denied);
      }
      currentClient = owner.client;
      await svc.from("course_versions").update({ status: "in_review" }).eq("id", a.versionId);
      expect(await savePricing(a.courseId, input())).toEqual({ ok: false, error: "This course is locked while it is in review or published." });
      await svc.from("course_versions").update({ status: "draft" }).eq("id", a.versionId);
    });

    it("the instructor cannot set visibility or price outside the granted columns", async () => {
      // status stays protected: a direct API update of a privileged column still fails.
      const { error } = await owner.client.from("course_versions").update({ status: "published" }).eq("id", a.versionId);
      expect(error).not.toBeNull();
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
