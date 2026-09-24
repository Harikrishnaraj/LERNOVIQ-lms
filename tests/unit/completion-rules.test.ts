import { describe, expect, it } from "vitest";
import { isCourseComplete, summarizeCompletion } from "@/features/completion/rules";

const lessons = [{ id: "l1" }, { id: "l2" }, { id: "quiz" }];
const base = {
  lessons,
  completedLessonIds: new Set<string>(),
  assessments: [] as { id: string; lessonId: string | null }[],
  passedAssessmentIds: new Set<string>(),
};

describe("course completion rule", () => {
  it("is complete when every lesson is completed and there are no assessments", () => {
    expect(isCourseComplete({ ...base, completedLessonIds: new Set(["l1", "l2", "quiz"]) })).toBe(true);
  });

  it("is not complete while any lesson is outstanding", () => {
    expect(isCourseComplete({ ...base, completedLessonIds: new Set(["l1", "l2"]) })).toBe(false);
  });

  it("is never complete for a course with no lessons", () => {
    expect(isCourseComplete({ ...base, lessons: [] })).toBe(false);
  });

  it("requires every assessment to be passed", () => {
    const input = {
      ...base,
      completedLessonIds: new Set(["l1", "l2", "quiz"]),
      assessments: [
        { id: "a1", lessonId: "quiz" },
        { id: "a2", lessonId: null },
      ],
    };
    expect(isCourseComplete({ ...input, passedAssessmentIds: new Set(["a1"]) })).toBe(false);
    expect(isCourseComplete({ ...input, passedAssessmentIds: new Set(["a1", "a2"]) })).toBe(true);
  });

  it("counts passing a linked assessment as completing its quiz lesson", () => {
    const summary = summarizeCompletion({
      ...base,
      completedLessonIds: new Set(["l1", "l2"]),
      assessments: [{ id: "a1", lessonId: "quiz" }],
      passedAssessmentIds: new Set(["a1"]),
    });
    expect(summary).toMatchObject({ lessonsDone: 3, lessonsTotal: 3, complete: true });
  });

  it("does not let a failed or pending assessment satisfy its lesson", () => {
    const summary = summarizeCompletion({
      ...base,
      completedLessonIds: new Set(["l1", "l2"]),
      assessments: [{ id: "a1", lessonId: "quiz" }],
      passedAssessmentIds: new Set(),
    });
    expect(summary).toMatchObject({ lessonsDone: 2, assessmentsPassed: 0, complete: false });
  });

  it("reports counts for progress displays", () => {
    expect(
      summarizeCompletion({ ...base, completedLessonIds: new Set(["l1"]), assessments: [{ id: "a", lessonId: null }] }),
    ).toEqual({ lessonsTotal: 3, lessonsDone: 1, assessmentsTotal: 1, assessmentsPassed: 0, complete: false });
  });
});
