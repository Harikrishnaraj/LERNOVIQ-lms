import { describe, expect, it } from "vitest";
import { basicsSchema, slugCandidates, slugify } from "@/features/course-authoring/schemas";
import { isEditableStatus, pickEditableVersion } from "@/features/course-authoring/versions";
import { nextBuiltStep } from "@/features/course-authoring/steps";
import { sniffImage } from "@/lib/image";

const valid = { title: "Intro to Python", subtitle: "", categorySlug: "", level: "beginner", language: "en" };

describe("basicsSchema", () => {
  it("accepts valid basics and turns empty optionals into null", () => {
    const r = basicsSchema.parse(valid);
    expect(r).toEqual({ title: "Intro to Python", subtitle: null, categorySlug: null, level: "beginner", language: "en" });
  });

  it("trims the title and keeps a subtitle and category slug", () => {
    const r = basicsSchema.parse({ ...valid, title: "  Data Science  ", subtitle: " Learn it ", categorySlug: "data-science" });
    expect(r).toMatchObject({ title: "Data Science", subtitle: "Learn it", categorySlug: "data-science" });
  });

  it("rejects short/long titles", () => {
    expect(basicsSchema.safeParse({ ...valid, title: "ab" }).success).toBe(false);
    expect(basicsSchema.safeParse({ ...valid, title: "x".repeat(121) }).success).toBe(false);
  });

  it("rejects an over-long subtitle, unknown level/language and a bad category slug", () => {
    expect(basicsSchema.safeParse({ ...valid, subtitle: "x".repeat(201) }).success).toBe(false);
    expect(basicsSchema.safeParse({ ...valid, level: "expert" }).success).toBe(false);
    expect(basicsSchema.safeParse({ ...valid, language: "xx" }).success).toBe(false);
    expect(basicsSchema.safeParse({ ...valid, categorySlug: "Not A Slug!" }).success).toBe(false);
  });
});

describe("slugify / slugCandidates", () => {
  it("makes url-safe ascii slugs", () => {
    expect(slugify("Intro to Python!")).toBe("intro-to-python");
    expect(slugify("  Café & Crème -- 101  ")).toBe("cafe-creme-101");
    expect(slugify("日本語")).toBe("course");
    expect(slugify("---")).toBe("course");
  });

  it("caps the length without leaving a trailing dash", () => {
    const s = slugify("word ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });

  it("proposes the plain slug first, then numbered and random fallbacks", () => {
    let n = 0;
    const c = slugCandidates("My Course", () => `r${n++}`);
    expect(c.slice(0, 3)).toEqual(["my-course", "my-course-2", "my-course-3"]);
    expect(c[3]).toBe("my-course-r0");
    expect(new Set(c).size).toBe(c.length);
  });
});

describe("pickEditableVersion", () => {
  const v = (versionNumber: number, status: string) => ({ id: `v${versionNumber}`, versionNumber, status });
  it("returns the newest version when it is draft or has changes requested", () => {
    expect(pickEditableVersion([v(1, "published"), v(2, "draft")])?.id).toBe("v2");
    expect(pickEditableVersion([v(1, "changes_requested")])?.id).toBe("v1");
  });
  it("returns null when the newest version is locked", () => {
    for (const s of ["submitted", "in_review", "approved", "published", "archived", "rejected"]) {
      expect(pickEditableVersion([v(1, "draft"), v(2, s)]), s).toBeNull();
    }
    expect(pickEditableVersion([])).toBeNull();
  });
  it("knows the editable statuses", () => {
    expect(isEditableStatus("draft")).toBe(true);
    expect(isEditableStatus("published")).toBe(false);
  });
});

describe("nextBuiltStep", () => {
  it("skips steps that are not built yet and never points backwards", () => {
    const next = nextBuiltStep("basics");
    expect(next === null || next.built).toBe(true);
    expect(nextBuiltStep("submit")).toBeNull();
  });
});

describe("sniffImage", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  it("detects PNG, JPEG and WebP by content", () => {
    expect(sniffImage(png)).toEqual({ mime: "image/png", ext: "png" });
    expect(sniffImage(jpg)).toEqual({ mime: "image/jpeg", ext: "jpg" });
    expect(sniffImage(webp)).toEqual({ mime: "image/webp", ext: "webp" });
  });
  it("rejects SVG, GIF, HTML, empty and truncated data", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    for (const bytes of [enc("<svg xmlns='x'/>"), enc("GIF89a...."), enc("<html><script>"), new Uint8Array(), Uint8Array.from([0x89, 0x50])]) {
      expect(sniffImage(bytes)).toBeNull();
    }
  });
  it("is not fooled by a spoofed extension: only bytes count", () => {
    expect(sniffImage(new TextEncoder().encode("MZ fake.png"))).toBeNull();
  });
});
