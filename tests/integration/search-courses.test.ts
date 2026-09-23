import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { parseCatalogFilters, type CatalogFilters } from "@/features/catalog/filters";
import { searchCourses } from "@/features/catalog/search-courses";
import {
  cleanup,
  createCourse,
  createUserWithRole,
  serviceClient,
  uniqueTag,
} from "../support/course-fixtures";

const hasLiveProject = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// F-101: search + every filter + sort + pagination, against the live project as an anonymous user.
describe.skipIf(!hasLiveProject)("search_courses (T-032, live Supabase)", () => {
  const svc = hasLiveProject ? serviceClient() : (null as never);
  const anon = () =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false },
      },
    );
  const tag = uniqueTag("qx"); // one made-up word all fixture titles share
  const courseIds: string[] = [];
  const userIds: string[] = [];
  let categoryId: string;
  const slugs: Record<string, string> = {};
  const search = (overrides: Partial<CatalogFilters>) =>
    searchCourses(anon(), { ...parseCatalogFilters({}), q: tag, ...overrides });

  beforeAll(async () => {
    const instructor = await createUserWithRole(svc, `${tag}-inst`, "instructor", {
      fullName: "Fixture Instructor",
    });
    userIds.push(instructor.id);
    const { data: cat } = await svc
      .from("categories")
      .insert({ slug: `${tag}-cat`, name: "Fixture Category" })
      .select("id")
      .single();
    categoryId = cat!.id;

    const defs = [
      {
        key: "a",
        title: `${tag} basics`,
        level: "beginner",
        price: 0,
        rating: 4.8,
        mins: 30,
        lang: "en",
        cat: true,
      },
      {
        key: "b",
        title: `${tag} pro`,
        level: "advanced",
        price: 5000,
        rating: 3.2,
        mins: 120,
        lang: "en",
        cat: false,
      },
      {
        key: "c",
        title: `${tag} espanol`,
        level: "beginner",
        price: 2000,
        rating: 4.1,
        mins: 400,
        lang: "es",
        cat: false,
      },
    ] as const;
    for (const d of defs) {
      const created = await createCourse(svc, instructor.id, {
        slug: `${tag}-${d.key}`,
        title: d.title,
        subtitle: "fixture",
        level: d.level,
        priceCents: d.price,
        ratingAvg: d.rating,
        ratingCount: 10,
        language: d.lang,
        categoryId: d.cat ? categoryId : null,
        sections: [{ title: "S", lessons: [{ title: "L", minutes: d.mins }] }],
      });
      courseIds.push(created.courseId);
      slugs[d.key] = created.slug;
    }
    // Unpublished course with the same token must never appear.
    const draft = await createCourse(svc, instructor.id, {
      slug: `${tag}-draft`,
      title: `${tag} draft`,
      publish: false,
    });
    courseIds.push(draft.courseId);
  }, 60_000);

  afterAll(async () => {
    await cleanup(svc, { courseIds, userIds });
    await svc.from("categories").delete().eq("slug", `${tag}-cat`);
  }, 60_000);

  const slugsOf = (r: Awaited<ReturnType<typeof search>>) => r.courses.map((c) => c.slug).sort();

  it("full-text search finds published courses only and reports the total", async () => {
    const r = await search({});
    expect(slugsOf(r)).toEqual([`${tag}-a`, `${tag}-b`, `${tag}-c`]);
    expect(r.total).toBe(3);
    expect(r.courses[0].instructorName).toBe("Fixture Instructor");
  });

  it("returns nothing for a query that matches no course", async () => {
    const r = await search({ q: `${tag}zzzznomatch` });
    expect(r.courses).toEqual([]);
    expect(r.total).toBe(0);
  });

  it("filters by category", async () => {
    expect(slugsOf(await search({ category: `${tag}-cat` }))).toEqual([`${tag}-a`]);
  });

  it("filters by level", async () => {
    expect(slugsOf(await search({ level: "advanced" }))).toEqual([`${tag}-b`]);
  });

  it("filters by language", async () => {
    expect(slugsOf(await search({ language: "es" }))).toEqual([`${tag}-c`]);
  });

  it("filters by duration bucket", async () => {
    expect(slugsOf(await search({ duration: "short" }))).toEqual([`${tag}-a`]);
    expect(slugsOf(await search({ duration: "medium" }))).toEqual([`${tag}-b`]);
    expect(slugsOf(await search({ duration: "long" }))).toEqual([`${tag}-c`]);
  });

  it("filters by price", async () => {
    expect(slugsOf(await search({ price: "free" }))).toEqual([`${tag}-a`]);
    expect(slugsOf(await search({ price: "paid" }))).toEqual([`${tag}-b`, `${tag}-c`]);
  });

  it("filters by minimum rating", async () => {
    expect(slugsOf(await search({ rating: "4" }))).toEqual([`${tag}-a`, `${tag}-c`]);
    expect(slugsOf(await search({ rating: "4.5" }))).toEqual([`${tag}-a`]);
  });

  it("combines filters", async () => {
    expect(slugsOf(await search({ level: "beginner", price: "paid" }))).toEqual([`${tag}-c`]);
  });

  it("sorts by price and rating", async () => {
    const low = await search({ sort: "price_low" });
    expect(low.courses.map((c) => c.slug)).toEqual([`${tag}-a`, `${tag}-c`, `${tag}-b`]);
    const high = await search({ sort: "price_high" });
    expect(high.courses.map((c) => c.slug)).toEqual([`${tag}-b`, `${tag}-c`, `${tag}-a`]);
    const top = await search({ sort: "top_rated" });
    expect(top.courses.map((c) => c.slug)).toEqual([`${tag}-a`, `${tag}-c`, `${tag}-b`]);
  });

  it("paginates with a stable total", async () => {
    const { data: p1 } = await anon().rpc("search_courses", {
      p_query: tag,
      p_sort: "price_low",
      p_limit: 2,
      p_offset: 0,
    });
    const { data: p2 } = await anon().rpc("search_courses", {
      p_query: tag,
      p_sort: "price_low",
      p_limit: 2,
      p_offset: 2,
    });
    expect(p1).toHaveLength(2);
    expect(p2).toHaveLength(1);
    expect(Number(p1![0].total_count)).toBe(3);
    expect(Number(p2![0].total_count)).toBe(3);
  });
});
