import { describe, expect, it } from "vitest";
import {
  adjacentLessons,
  isLessonLocked,
  resumeLessonId,
  type PlayerLesson,
  type PlayerSection,
} from "@/features/player/navigation";

const lesson = (id: string, isPreview = false): PlayerLesson => ({
  id,
  title: id,
  type: "text",
  durationMinutes: 5,
  isPreview,
});
const sections: PlayerSection[] = [
  { id: "s1", title: "One", lessons: [lesson("a", true), lesson("b")] },
  { id: "s2", title: "Two", lessons: [lesson("c")] },
];

describe("adjacentLessons", () => {
  it("walks across section boundaries", () => {
    expect(adjacentLessons(sections, "b")).toMatchObject({
      previous: { id: "a" },
      next: { id: "c" },
      index: 1,
      total: 3,
    });
  });
  it("has no previous on the first lesson and no next on the last", () => {
    expect(adjacentLessons(sections, "a").previous).toBeNull();
    expect(adjacentLessons(sections, "c").next).toBeNull();
  });
  it("reports an unknown lesson", () => {
    expect(adjacentLessons(sections, "zzz")).toMatchObject({ index: -1, previous: null, next: null });
  });
});

describe("resumeLessonId", () => {
  it("returns the first incomplete lesson", () => {
    expect(resumeLessonId(sections, new Set(["a"]))).toBe("b");
  });
  it("falls back to the first lesson when everything is complete", () => {
    expect(resumeLessonId(sections, new Set(["a", "b", "c"]))).toBe("a");
  });
  it("returns null for an empty course", () => {
    expect(resumeLessonId([], new Set())).toBeNull();
  });
});

describe("isLessonLocked", () => {
  it("locks non-preview lessons for non-enrolled viewers only", () => {
    expect(isLessonLocked(lesson("x"), false)).toBe(true);
    expect(isLessonLocked(lesson("x", true), false)).toBe(false);
    expect(isLessonLocked(lesson("x"), true)).toBe(false);
  });
});
