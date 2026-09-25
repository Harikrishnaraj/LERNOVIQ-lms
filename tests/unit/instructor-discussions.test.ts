import { describe, expect, it } from "vitest";
import {
  filterInstructorDiscussions,
  type InstructorThread,
} from "@/features/instructor/discussions";

describe("filterInstructorDiscussions", () => {
  const sample = (id: string, over: Partial<InstructorThread> = {}): InstructorThread => ({
    id,
    courseId: "course-1",
    courseSlug: "react-101",
    courseTitle: "React 101",
    title: `Discussion ${id}`,
    body: "How do hooks work?",
    authorName: "Alice Learner",
    createdAt: "2026-09-25T10:00:00Z",
    replies: 0,
    votes: 0,
    answered: false,
    pinned: false,
    hidden: false,
    openReports: 0,
    ...over,
  });

  const list: InstructorThread[] = [
    sample("1", { answered: false }),
    sample("2", { answered: true }),
    sample("3", { answered: false, hidden: true }),
    sample("4", { answered: false, openReports: 2 }),
    sample("5", { courseSlug: "nextjs-201", answered: false }),
  ];

  it("filters unanswered discussions (excluding hidden)", () => {
    const res = filterInstructorDiscussions(list, "unanswered", "");
    expect(res.map((t) => t.id)).toEqual(["1", "4", "5"]);
  });

  it("filters answered discussions (excluding hidden)", () => {
    const res = filterInstructorDiscussions(list, "answered", "");
    expect(res.map((t) => t.id)).toEqual(["2"]);
  });

  it("filters reported or hidden discussions for moderation", () => {
    const res = filterInstructorDiscussions(list, "reported", "");
    expect(res.map((t) => t.id)).toEqual(["3", "4"]);
  });

  it("filters by course slug", () => {
    const res = filterInstructorDiscussions(list, "all", "nextjs-201");
    expect(res.map((t) => t.id)).toEqual(["5"]);
  });

  it("combines status and course filters correctly", () => {
    const res = filterInstructorDiscussions(list, "unanswered", "react-101");
    expect(res.map((t) => t.id)).toEqual(["1", "4"]);
  });
});
