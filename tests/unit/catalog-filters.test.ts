import { describe, expect, it } from "vitest";
import { catalogHref, hasActiveFilters, parseCatalogFilters } from "@/features/catalog/filters";

describe("parseCatalogFilters", () => {
  it("defaults to newest, page 1, no filters", () => {
    const f = parseCatalogFilters({});
    expect(f).toEqual({
      q: null,
      category: null,
      level: null,
      language: null,
      duration: null,
      price: null,
      rating: null,
      sort: "newest",
      page: 1,
    });
    expect(hasActiveFilters(f)).toBe(false);
  });

  it("reads valid values, trimming the query", () => {
    const f = parseCatalogFilters({
      q: "  python ",
      category: "data-science",
      level: "beginner",
      language: "es",
      duration: "short",
      price: "free",
      rating: "4",
      sort: "top_rated",
      page: "3",
    });
    expect(f).toMatchObject({ q: "python", category: "data-science", level: "beginner", page: 3 });
    expect(f.sort).toBe("top_rated");
    expect(hasActiveFilters(f)).toBe(true);
  });

  it("drops invalid values instead of trusting them", () => {
    const f = parseCatalogFilters({
      level: "expert",
      language: "xx",
      duration: "forever",
      price: "cheap",
      rating: "6",
      category: "Not A Slug!; drop table",
      sort: "random",
      page: "-4",
    });
    expect(f).toMatchObject({
      level: null,
      language: null,
      duration: null,
      price: null,
      rating: null,
      category: null,
      sort: "newest",
      page: 1,
    });
  });

  it("caps very long queries and absurd page numbers", () => {
    const f = parseCatalogFilters({ q: "x".repeat(500), page: "99999999" });
    expect(f.q).toHaveLength(100);
    expect(f.page).toBe(1000);
  });

  it("uses the first value when a param is repeated", () => {
    expect(parseCatalogFilters({ level: ["advanced", "beginner"] }).level).toBe("advanced");
  });

  it("defaults sort to relevance with a query, and never allows relevance without one", () => {
    expect(parseCatalogFilters({ q: "sql" }).sort).toBe("relevance");
    expect(parseCatalogFilters({ sort: "relevance" }).sort).toBe("newest");
  });
});

describe("catalogHref", () => {
  it("omits defaults", () => {
    expect(catalogHref(parseCatalogFilters({}))).toBe("/courses");
    expect(catalogHref(parseCatalogFilters({ q: "sql" }))).toBe("/courses?q=sql");
  });

  it("keeps filters and changes only the overridden page", () => {
    const f = parseCatalogFilters({ q: "sql", level: "beginner", sort: "top_rated" });
    expect(catalogHref(f, { page: 2 })).toBe("/courses?q=sql&level=beginner&sort=top_rated&page=2");
    expect(catalogHref(f, { page: 1 })).toBe("/courses?q=sql&level=beginner&sort=top_rated");
  });
});
