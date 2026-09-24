import { describe, expect, it } from "vitest";
import {
  computeExpiry,
  decideStart,
  gradeAttempt,
  isExpired,
  isPastGrace,
  normalizeText,
  shouldRevealKey,
  type GradableQuestion,
} from "@/features/assessments/grading";

const q = (over: Partial<GradableQuestion> & Pick<GradableQuestion, "id" | "type">): GradableQuestion => ({
  points: 1,
  correctOptionIds: [],
  acceptedAnswers: [],
  ...over,
});

describe("gradeAttempt", () => {
  const questions = [
    q({ id: "m", type: "mcq", points: 2, correctOptionIds: ["b"] }),
    q({ id: "t", type: "true_false", correctOptionIds: ["true"] }),
    q({ id: "x", type: "multi", points: 3, correctOptionIds: ["a", "c"] }),
    q({ id: "s", type: "short_answer", acceptedAnswers: ["Paris", "the city of paris"] }),
  ];

  it("scores a perfect attempt at 100% and passes", () => {
    const r = gradeAttempt(questions, { m: "b", t: "true", x: ["c", "a"], s: "  PARIS " }, 70);
    expect(r).toMatchObject({ score: 7, maxScore: 7, percent: 100, passed: true, pendingManual: false });
    expect(r.results.every((x) => x.correct)).toBe(true);
  });

  it("scores wrong and missing answers as zero", () => {
    const r = gradeAttempt(questions, { m: "a", x: ["a"] }, 70);
    expect(r.score).toBe(0);
    expect(r.percent).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("gives multi-select credit only for the exact set", () => {
    expect(gradeAttempt(questions, { x: ["a"] }, 0).results.find((x) => x.questionId === "x")?.correct).toBe(false);
    expect(gradeAttempt(questions, { x: ["a", "b", "c"] }, 0).results.find((x) => x.questionId === "x")?.correct).toBe(false);
    expect(gradeAttempt(questions, { x: ["a", "c"] }, 0).results.find((x) => x.questionId === "x")?.correct).toBe(true);
  });

  it("applies the pass mark threshold inclusively", () => {
    const two = [q({ id: "a", type: "mcq", correctOptionIds: ["1"] }), q({ id: "b", type: "mcq", correctOptionIds: ["1"] })];
    expect(gradeAttempt(two, { a: "1" }, 50)).toMatchObject({ percent: 50, passed: true });
    expect(gradeAttempt(two, { a: "1" }, 51)).toMatchObject({ percent: 50, passed: false });
  });

  it("rounds the percentage to two decimals", () => {
    const three = ["a", "b", "c"].map((id) => q({ id, type: "mcq", correctOptionIds: ["1"] }));
    expect(gradeAttempt(three, { a: "1" }, 0).percent).toBe(33.33);
  });

  it("does not accept the wrong answer type for a question", () => {
    expect(gradeAttempt(questions, { m: ["b"], s: ["Paris"] as unknown as string }, 0).score).toBe(0);
  });

  it("never marks a question with no configured key as correct", () => {
    const broken = [q({ id: "m", type: "mcq" }), q({ id: "s", type: "short_answer" })];
    expect(gradeAttempt(broken, { m: "", s: "" }, 0).score).toBe(0);
  });

  it("leaves essay and coding for manual review and withholds pass/fail", () => {
    const mixed = [
      q({ id: "m", type: "mcq", correctOptionIds: ["1"] }),
      q({ id: "e", type: "essay", points: 5 }),
      q({ id: "c", type: "coding", points: 5 }),
    ];
    const r = gradeAttempt(mixed, { m: "1", e: "long text" }, 70);
    expect(r).toMatchObject({ score: 1, maxScore: 1, pendingManual: true, passed: null });
    expect(r.results.filter((x) => x.correct === null)).toHaveLength(2);
  });

  it("handles an assessment with no gradable points", () => {
    expect(gradeAttempt([q({ id: "e", type: "essay" })], {}, 70)).toMatchObject({
      maxScore: 0,
      percent: 0,
      passed: null,
    });
  });
});

describe("normalizeText", () => {
  it("trims, lowercases and collapses whitespace", () => {
    expect(normalizeText("  Hello   WORLD\n")).toBe("hello world");
  });
});

describe("attempt timing", () => {
  const start = new Date("2026-01-01T10:00:00Z");
  it("computes expiry from the time limit, or none", () => {
    expect(computeExpiry(start, 15)).toBe("2026-01-01T10:15:00.000Z");
    expect(computeExpiry(start, null)).toBeNull();
  });
  it("detects expiry and the submit grace window", () => {
    const expiresAt = "2026-01-01T10:15:00.000Z";
    expect(isExpired(expiresAt, new Date("2026-01-01T10:14:59Z"))).toBe(false);
    expect(isExpired(expiresAt, new Date("2026-01-01T10:15:01Z"))).toBe(true);
    expect(isPastGrace(expiresAt, new Date("2026-01-01T10:15:20Z"))).toBe(false);
    expect(isPastGrace(expiresAt, new Date("2026-01-01T10:15:31Z"))).toBe(true);
    expect(isExpired(null, new Date())).toBe(false);
    expect(isPastGrace(null, new Date())).toBe(false);
  });
});

describe("retry rules", () => {
  it("allows the first attempt", () => {
    expect(decideStart([], 3)).toEqual({ ok: true, attemptNumber: 1 });
  });
  it("blocks a second attempt while one is in progress", () => {
    expect(decideStart([{ status: "in_progress", passed: null }], 3)).toEqual({
      ok: false,
      reason: "in_progress",
    });
  });
  it("numbers retries and stops at the attempt limit", () => {
    const done = { status: "graded", passed: false } as const;
    expect(decideStart([done], 3)).toEqual({ ok: true, attemptNumber: 2 });
    expect(decideStart([done, done, done], 3)).toEqual({ ok: false, reason: "no_attempts_left" });
  });
  it("allows unlimited attempts when the limit is null", () => {
    const done = { status: "graded", passed: false } as const;
    expect(decideStart(Array(50).fill(done), null)).toEqual({ ok: true, attemptNumber: 51 });
  });
  it("reveals the key only after passing or exhausting attempts", () => {
    const fail = { status: "graded", passed: false } as const;
    const pass = { status: "graded", passed: true } as const;
    expect(shouldRevealKey([fail], 3)).toBe(false);
    expect(shouldRevealKey([fail, pass], 3)).toBe(true);
    expect(shouldRevealKey([fail, fail, fail], 3)).toBe(true);
    expect(shouldRevealKey([fail, fail, fail], null)).toBe(false);
  });
});
