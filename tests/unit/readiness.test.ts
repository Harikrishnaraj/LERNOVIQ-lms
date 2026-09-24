import { describe, expect, it } from "vitest";
import { evaluateReadiness, readinessFixHref, type ReadinessSnapshot } from "@/features/course-authoring/readiness";

const ready = (): ReadinessSnapshot => ({
  version: {
    title: "Intro to Python",
    description: "A practical introduction to Python programming for complete beginners, with exercises.",
    outcomes: ["Write scripts"],
    thumbnailUrl: "https://example.com/t.png",
    certificateEnabled: true,
    categorySlug: "programming",
  },
  sections: [
    {
      id: "s1",
      title: "Basics",
      lessons: [
        { id: "l1", title: "Hello", type: "text", content: "<p>Hi</p>", videoUrl: null },
        { id: "l2", title: "Watch", type: "video", content: "", videoUrl: "https://example.com/v.mp4" },
      ],
    },
  ],
  assessments: [{ id: "a1", title: "Quiz", questionCount: 3 }],
});

const missingIds = (s: ReadinessSnapshot) => evaluateReadiness(s).missing.map((m) => m.id);

describe("evaluateReadiness", () => {
  it("passes a complete course", () => {
    const r = evaluateReadiness(ready());
    expect(r.ready).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it("flags every missing basics field", () => {
    const s = ready();
    s.version = { ...s.version, title: "ab", description: "short", categorySlug: null, thumbnailUrl: null, outcomes: [] };
    expect(missingIds(s)).toEqual(["title", "description", "category", "thumbnail", "outcomes"]);
  });

  it("flags a course with no lessons and empty sections", () => {
    const s = ready();
    s.sections = [];
    expect(missingIds(s)).toEqual(["lessons"]);
    s.sections = [{ id: "s", title: "Empty", lessons: [] }];
    expect(missingIds(s)).toEqual(["lessons", "empty-sections"]);
  });

  it("flags empty text and video lessons and deep-links to the first one", () => {
    const s = ready();
    s.sections[0].lessons = [
      { id: "l1", title: "Blank", type: "text", content: "<p> &nbsp; </p>", videoUrl: null },
      { id: "l2", title: "NoVideo", type: "video", content: "", videoUrl: null },
    ];
    const r = evaluateReadiness(s);
    const item = r.missing.find((m) => m.id === "lesson-content")!;
    expect(item.detail).toContain("Blank, NoVideo");
    expect(readinessFixHref("c1", item)).toBe("/instructor/courses/c1/lessons/l1");
  });

  it("requires an assessment only when certificates are on, and questions in each", () => {
    const s = ready();
    s.assessments = [];
    expect(missingIds(s)).toEqual(["assessment"]);
    s.version.certificateEnabled = false;
    expect(missingIds(s)).toEqual([]);
    s.assessments = [{ id: "a9", title: "Empty quiz", questionCount: 0 }];
    const r = evaluateReadiness(s);
    expect(r.missing.map((m) => m.id)).toEqual(["questions"]);
    expect(readinessFixHref("c1", r.missing[0])).toBe("/instructor/courses/c1/assessments/a9");
  });

  it("links step-level items to the wizard step", () => {
    const s = ready();
    s.version.thumbnailUrl = null;
    expect(readinessFixHref("c1", evaluateReadiness(s).missing[0])).toBe("/instructor/courses/c1/basics");
  });
});
