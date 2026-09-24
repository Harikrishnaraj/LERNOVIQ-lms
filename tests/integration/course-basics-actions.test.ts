// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanup, createCourse, createUserWithRole, serviceClient, uniqueTag } from "../support/course-fixtures";

// The Server Actions read the request-scoped client; here it is a client signed in as a test user.
let currentClient: SupabaseClient;
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => currentClient }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createCourseAction, updateBasicsAction } from "@/features/course-authoring/actions";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PNG = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

function form(fields: Record<string, string>, thumbnail?: { bytes: Uint8Array; name: string; type: string }) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (thumbnail) fd.set("thumbnail", new File([thumbnail.bytes as BlobPart], thumbnail.name, { type: thumbnail.type }));
  return fd;
}
const basics = (over: Record<string, string> = {}) => ({
  title: "Intro to Testing",
  subtitle: "Learn how",
  categorySlug: "",
  level: "beginner",
  language: "en",
  ...over,
});

// F-202 step 1: create / edit basics, thumbnail upload, ownership and locking.
describe.skipIf(!hasLiveProject)("course basics actions (T-051, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const tag = uniqueTag("cb");
  const courseIds: string[] = [];
  const userIds: string[] = [];
  const learnerIds: string[] = [];
  const objectPaths: string[] = [];
  let owner: { id: string; client: SupabaseClient };
  let other: { id: string; client: SupabaseClient };
  let learner: { id: string; client: SupabaseClient };
  let categorySlug: string;

  async function user(name: string, role: string) {
    const u = await createUserWithRole(svc, `${tag}-${name}`, role);
    (role === "learner" ? learnerIds : userIds).push(u.id);
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (error) throw error;
    return { id: u.id, client };
  }

  beforeAll(async () => {
    owner = await user("own", "instructor");
    other = await user("oth", "instructor");
    learner = await user("lrn", "learner");
    categorySlug = `${tag}-cat`;
    await svc.from("categories").insert({ slug: categorySlug, name: "Basics Test Category" });
  }, 90_000);

  afterAll(async () => {
    if (objectPaths.length) await svc.storage.from("course-thumbnails").remove(objectPaths);
    await cleanup(svc, { learnerIds, courseIds, userIds });
    await svc.from("categories").delete().eq("slug", categorySlug);
  }, 60_000);

  const trackCourse = async (id: string) => {
    courseIds.push(id);
    const { data } = await svc.from("course_versions").select("thumbnail_url").eq("course_id", id);
    for (const v of data ?? []) {
      const i = (v.thumbnail_url as string | null)?.indexOf("/course-thumbnails/") ?? -1;
      if (v.thumbnail_url && i >= 0) objectPaths.push((v.thumbnail_url as string).slice(i + "/course-thumbnails/".length));
    }
  };

  it("creates the course and a first draft version, resumable by id", async () => {
    currentClient = owner.client;
    const r = await createCourseAction(form(basics({ categorySlug })));
    expect(r).toMatchObject({ ok: true });
    const courseId = (r as { courseId: string }).courseId;
    courseIds.push(courseId);

    const { data: course } = await svc.from("courses").select("slug, instructor_id, category_id").eq("id", courseId).single();
    expect(course).toMatchObject({ instructor_id: owner.id });
    expect(course!.slug).toMatch(/^intro-to-testing/);
    expect(course!.category_id).toBeTruthy();
    const { data: versions } = await svc.from("course_versions").select("version_number, status, title, subtitle, level, language").eq("course_id", courseId);
    expect(versions).toEqual([
      { version_number: 1, status: "draft", title: "Intro to Testing", subtitle: "Learn how", level: "beginner", language: "en" },
    ]);
  });

  it("gives two courses with the same title different URLs", async () => {
    currentClient = owner.client;
    const title = `Same Title ${tag}`;
    const a = (await createCourseAction(form(basics({ title })))) as { courseId: string };
    const b = (await createCourseAction(form(basics({ title })))) as { courseId: string };
    courseIds.push(a.courseId, b.courseId);
    const { data } = await svc.from("courses").select("slug").in("id", [a.courseId, b.courseId]);
    expect(new Set(data!.map((c) => c.slug)).size).toBe(2);
  });

  it("uploads a valid thumbnail to storage and stores its public URL", async () => {
    currentClient = owner.client;
    const r = (await createCourseAction(
      form(basics({ title: `Thumb ${tag}` }), { bytes: PNG, name: "cover.png", type: "image/png" }),
    )) as { ok: true; courseId: string; thumbnailError?: string };
    expect(r.ok).toBe(true);
    expect(r.thumbnailError).toBeUndefined();
    await trackCourse(r.courseId);
    const { data } = await svc.from("course_versions").select("thumbnail_url").eq("course_id", r.courseId).single();
    expect(data!.thumbnail_url).toContain("/object/public/course-thumbnails/");
    const res = await fetch(data!.thumbnail_url as string);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
  });

  it("rejects a fake image, an oversized file and an empty title before creating anything", async () => {
    currentClient = owner.client;
    const before = (await svc.from("courses").select("id", { count: "exact", head: true }).eq("instructor_id", owner.id)).count;

    const fake = await createCourseAction(
      form(basics(), { bytes: new TextEncoder().encode("<script>alert(1)</script>"), name: "x.png", type: "image/png" }),
    );
    expect(fake).toMatchObject({ ok: false, fieldErrors: { thumbnail: expect.stringContaining("PNG, JPEG or WebP") } });

    const huge = new Uint8Array(2 * 1024 * 1024 + 1);
    huge.set(PNG);
    const big = await createCourseAction(form(basics(), { bytes: huge, name: "big.png", type: "image/png" }));
    expect(big).toMatchObject({ ok: false, fieldErrors: { thumbnail: expect.stringContaining("2 MB") } });

    const noTitle = await createCourseAction(form(basics({ title: "  " })));
    expect(noTitle).toMatchObject({ ok: false, fieldErrors: { title: expect.any(String) } });

    const badCat = await createCourseAction(form(basics({ categorySlug: "does-not-exist" })));
    expect(badCat).toMatchObject({ ok: false, fieldErrors: { categorySlug: "Pick a category from the list." } });

    const after = (await svc.from("courses").select("id", { count: "exact", head: true }).eq("instructor_id", owner.id)).count;
    expect(after).toBe(before);
  });

  it("refuses learners and signed-out callers", async () => {
    currentClient = learner.client;
    expect(await createCourseAction(form(basics()))).toEqual({ ok: false, error: "Your account cannot create courses." });
    currentClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    expect(await createCourseAction(form(basics()))).toEqual({ ok: false, error: "Please log in again." });
  });

  describe("editing", () => {
    let courseId: string;
    beforeAll(async () => {
      currentClient = owner.client;
      courseId = ((await createCourseAction(form(basics({ title: `Edit ${tag}` })))) as { courseId: string }).courseId;
      courseIds.push(courseId);
    });

    it("saves changes to the draft, including category, and they persist", async () => {
      currentClient = owner.client;
      const r = await updateBasicsAction(
        courseId,
        form(basics({ title: `Edited ${tag}`, subtitle: "", level: "advanced", language: "es", categorySlug })),
      );
      expect(r).toMatchObject({ ok: true });
      const { data: v } = await svc.from("course_versions").select("title, subtitle, level, language").eq("course_id", courseId).single();
      expect(v).toEqual({ title: `Edited ${tag}`, subtitle: null, level: "advanced", language: "es" });
      const { data: c } = await svc.from("courses").select("category_id").eq("id", courseId).single();
      expect(c!.category_id).toBeTruthy();
    });

    it("replaces and removes the thumbnail", async () => {
      currentClient = owner.client;
      await updateBasicsAction(courseId, form(basics({ title: `Edited ${tag}` }), { bytes: PNG, name: "a.png", type: "image/png" }));
      const first = (await svc.from("course_versions").select("thumbnail_url").eq("course_id", courseId).single()).data!.thumbnail_url as string;
      expect(first).toContain("/course-thumbnails/");

      await updateBasicsAction(courseId, form(basics({ title: `Edited ${tag}` }), { bytes: PNG, name: "b.png", type: "image/png" }));
      const second = (await svc.from("course_versions").select("thumbnail_url").eq("course_id", courseId).single()).data!.thumbnail_url as string;
      expect(second).not.toBe(first);
      expect((await fetch(first)).status).toBe(400); // the replaced file was deleted

      await updateBasicsAction(courseId, form({ ...basics({ title: `Edited ${tag}` }), removeThumbnail: "on" }));
      expect((await svc.from("course_versions").select("thumbnail_url").eq("course_id", courseId).single()).data!.thumbnail_url).toBeNull();
    });

    it("cannot be edited by another instructor or a learner", async () => {
      for (const who of [other, learner]) {
        currentClient = who.client;
        expect(await updateBasicsAction(courseId, form(basics({ title: "Hijacked" })))).toEqual({
          ok: false,
          error: "This course is not available.",
        });
      }
      const { data } = await svc.from("course_versions").select("title").eq("course_id", courseId).single();
      expect(data!.title).toBe(`Edited ${tag}`);
    });

    it("is locked while the version is in review, and unlocks when changes are requested", async () => {
      currentClient = owner.client;
      await svc.from("course_versions").update({ status: "in_review" }).eq("course_id", courseId);
      expect(await updateBasicsAction(courseId, form(basics({ title: "Sneaky" })))).toEqual({
        ok: false,
        error: "This course is locked while it is in review or published.",
      });
      await svc.from("course_versions").update({ status: "changes_requested" }).eq("course_id", courseId);
      expect(await updateBasicsAction(courseId, form(basics({ title: `Reworked ${tag}` })))).toMatchObject({ ok: true });
    });

    it("rejects malformed course ids", async () => {
      currentClient = owner.client;
      expect(await updateBasicsAction("not-a-uuid", form(basics()))).toEqual({ ok: false, error: "This course is not available." });
    });
  });

  it("does not let an instructor touch a course they do not own even by id guessing", async () => {
    const foreign = await createCourse(svc, other.id, { slug: `${tag}-foreign`, title: `${tag} foreign`, publish: false });
    courseIds.push(foreign.courseId);
    currentClient = owner.client;
    expect(await updateBasicsAction(foreign.courseId, form(basics()))).toEqual({ ok: false, error: "This course is not available." });
  });
});
