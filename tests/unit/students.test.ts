import { describe, expect, it } from "vitest";
import {
  filterStudents,
  pageStudents,
  parseStudentQuery,
  percentOf,
  segmentCounts,
  segmentFor,
  STUDENTS_PAGE_SIZE,
  type Student,
} from "@/features/instructor/students";

const now = new Date("2026-06-30T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();
const e = (over: Partial<Parameters<typeof segmentFor>[0]> = {}) => ({
  status: "active", completedLessons: 0, totalLessons: 10, enrolledAt: daysAgo(30), lastActivityAt: null as string | null, ...over,
});

describe("segmentFor", () => {
  it("completed wins over everything", () => {
    expect(segmentFor(e({ status: "completed", lastActivityAt: daysAgo(100) }), now)).toBe("completed");
  });

  it("just enrolled: new and nothing done", () => {
    expect(segmentFor(e({ enrolledAt: daysAgo(2) }), now)).toBe("just_enrolled");
    expect(segmentFor(e({ enrolledAt: daysAgo(6.9) }), now)).toBe("just_enrolled");
    // Progress in the first week makes them started, not just enrolled.
    expect(segmentFor(e({ enrolledAt: daysAgo(2), completedLessons: 1, lastActivityAt: daysAgo(1) }), now)).toBe("started");
  });

  it("at risk: quiet for 14 days, counted from the last activity or the enrolment", () => {
    expect(segmentFor(e({ enrolledAt: daysAgo(40), completedLessons: 3, lastActivityAt: daysAgo(14) }), now)).toBe("at_risk");
    expect(segmentFor(e({ enrolledAt: daysAgo(40), completedLessons: 3, lastActivityAt: daysAgo(13) }), now)).toBe("started");
    expect(segmentFor(e({ enrolledAt: daysAgo(20) }), now)).toBe("at_risk"); // never started
    expect(segmentFor(e({ enrolledAt: daysAgo(10) }), now)).toBe("started"); // waiting to begin, not yet at risk
    expect(segmentFor(e({ enrolledAt: daysAgo(40), completedLessons: 9, lastActivityAt: daysAgo(30) }), now)).toBe("at_risk");
  });

  it("on track: active recently and at least half done", () => {
    expect(segmentFor(e({ completedLessons: 5, lastActivityAt: daysAgo(3) }), now)).toBe("on_track");
    expect(segmentFor(e({ completedLessons: 4, lastActivityAt: daysAgo(3) }), now)).toBe("started");
    expect(segmentFor(e({ completedLessons: 10, totalLessons: 10, lastActivityAt: daysAgo(1) }), now)).toBe("on_track");
  });

  it("handles a course with no lessons", () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(segmentFor(e({ totalLessons: 0, enrolledAt: daysAgo(10) }), now)).toBe("started");
    expect(percentOf(3, 4)).toBe(75);
    expect(percentOf(9, 4)).toBe(100);
  });
});

const student = (over: Partial<Student>): Student => ({
  enrollmentId: "e", userId: "u", name: "Ada", courseId: "c1", courseTitle: "Course", status: "active", enrolledAt: daysAgo(10),
  completedAt: null, completedLessons: 0, totalLessons: 4, lastActivityAt: null, percent: 0, segment: "started", ...over,
});

describe("filters, counts and paging", () => {
  const list = [
    student({ enrollmentId: "1", name: "Ada Lovelace", courseId: "c1", segment: "on_track" }),
    student({ enrollmentId: "2", name: "Grace Hopper", courseId: "c2", segment: "at_risk", lastActivityAt: daysAgo(20) }),
    student({ enrollmentId: "3", name: "Alan Turing", courseId: "c1", segment: "at_risk", lastActivityAt: daysAgo(40) }),
    student({ enrollmentId: "4", name: "Edsger", courseId: "c2", segment: "completed" }),
  ];

  it("parses the query and drops junk", () => {
    expect(parseStudentQuery({})).toEqual({ q: "", course: "", segment: "", page: 1 });
    expect(parseStudentQuery({ segment: "bogus", page: "-1" })).toEqual({ q: "", course: "", segment: "", page: 1 });
    expect(parseStudentQuery({ q: " ada ", segment: "at_risk", course: "c1", page: "3" })).toEqual({ q: "ada", course: "c1", segment: "at_risk", page: 3 });
  });

  it("filters by course and name, and counts segments over that set", () => {
    expect(filterStudents(list, { q: "", course: "c1" }).map((s) => s.enrollmentId)).toEqual(["1", "3"]);
    expect(filterStudents(list, { q: "GRACE", course: "" }).map((s) => s.enrollmentId)).toEqual(["2"]);
    expect(segmentCounts(list)).toEqual({ just_enrolled: 0, started: 0, on_track: 1, at_risk: 2, completed: 1 });
  });

  it("puts the least recently active first within a page", () => {
    const { rows, total } = pageStudents(list, "at_risk", 1);
    expect(rows.map((s) => s.enrollmentId)).toEqual(["3", "2"]);
    expect(total).toBe(2);
  });

  it("pages and clamps out-of-range pages", () => {
    const many = Array.from({ length: STUDENTS_PAGE_SIZE + 5 }, (_, i) => student({ enrollmentId: String(i), name: `S${i}` }));
    expect(pageStudents(many, "", 1).rows).toHaveLength(STUDENTS_PAGE_SIZE);
    expect(pageStudents(many, "", 2).rows).toHaveLength(5);
    expect(pageStudents(many, "", 99)).toMatchObject({ pages: 2, total: STUDENTS_PAGE_SIZE + 5 });
    expect(pageStudents([], "", 1)).toEqual({ rows: [], total: 0, pages: 1 });
  });
});
