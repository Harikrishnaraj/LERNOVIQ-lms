import { describe, expect, it } from "vitest";
import { dueDateToTimestamp, validateAssignedLearningInput } from "@/features/admin/assigned-learning";

const base = { scope: "organization", userId: null, contentType: "course", courseId: "c1", pathId: null, dueAt: null };

describe("validateAssignedLearningInput", () => {
  it("accepts a whole-organization course assignment with no due date", () => {
    expect(validateAssignedLearningInput(base)).toEqual({
      ok: true,
      value: { scope: "organization", userId: null, contentType: "course", courseId: "c1", pathId: null, dueAt: null },
    });
  });

  it("accepts a user-scoped path assignment with a due date", () => {
    const result = validateAssignedLearningInput({ scope: "user", userId: "u1", contentType: "path", courseId: null, pathId: "p1", dueAt: "2026-06-01" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({ scope: "user", userId: "u1", contentType: "path", pathId: "p1" });
      // A picked day means the end of that day (UTC), not its first moment.
      expect(result.value.dueAt).toBe("2026-06-01T23:59:59.999Z");
    }
  });

  it("rejects a user scope without a chosen member", () => {
    expect(validateAssignedLearningInput({ ...base, scope: "user", userId: null }).ok).toBe(false);
  });

  it("rejects a course content type without a chosen course", () => {
    expect(validateAssignedLearningInput({ ...base, courseId: null }).ok).toBe(false);
  });

  it("rejects a path content type without a chosen path", () => {
    expect(validateAssignedLearningInput({ ...base, contentType: "path", courseId: null, pathId: null }).ok).toBe(false);
  });

  it("rejects an unparseable due date", () => {
    expect(validateAssignedLearningInput({ ...base, dueAt: "not-a-date" }).ok).toBe(false);
  });

  it("rejects a calendar day that does not exist", () => {
    expect(validateAssignedLearningInput({ ...base, dueAt: "2026-02-30" }).ok).toBe(false);
  });


  it("rejects an unknown scope or content type", () => {
    expect(validateAssignedLearningInput({ ...base, scope: "team" }).ok).toBe(false);
    expect(validateAssignedLearningInput({ ...base, contentType: "quiz" }).ok).toBe(false);
  });
});

describe("dueDateToTimestamp", () => {
  it("stores a picked day as the last millisecond of that day in UTC", () => {
    expect(dueDateToTimestamp("2026-12-31")).toBe("2026-12-31T23:59:59.999Z");
  });

  it("is not overdue during the due day, and is once the day is over", () => {
    const due = new Date(dueDateToTimestamp("2026-06-01")!);
    expect(due < new Date("2026-06-01T18:00:00Z")).toBe(false);
    expect(due < new Date("2026-06-02T00:00:00Z")).toBe(true);
  });

  it("shows the chosen day unchanged when formatted in UTC", () => {
    const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
    expect(fmt.format(new Date(dueDateToTimestamp("2026-06-01")!))).toBe("Jun 1, 2026");
  });

  it("keeps a full timestamp as given", () => {
    expect(dueDateToTimestamp("2026-06-01T10:00:00Z")).toBe("2026-06-01T10:00:00.000Z");
  });

  it("returns null for an invalid date", () => {
    expect(dueDateToTimestamp("2026-13-01")).toBeNull();
    expect(dueDateToTimestamp("nope")).toBeNull();
  });
});
