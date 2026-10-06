import { describe, expect, it } from "vitest";
import {
  computeExpiry,
  decideStart,
  gradeAttempt,
  gradeWithManualScores,
  regradeBlockedReason,
  validateManualGrade,
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

// T-252: manual grading of essay/coding questions.
describe("gradeWithManualScores", () => {
  const mixed = [
    q({ id: "m", type: "mcq", points: 2, correctOptionIds: ["b"] }),
    q({ id: "e", type: "essay", points: 5 }),
    q({ id: "c", type: "coding", points: 3 }),
  ];

  it("stays pending (auto-graded part only) until every manual question is scored", () => {
    const r = gradeWithManualScores(mixed, { m: "b" }, 70, { e: { points: 5, feedback: "" } });
    expect(r).toMatchObject({ score: 2, maxScore: 2, passed: null, pendingManual: true });
  });

  it("scores every question once all manual marks exist, and decides pass/fail", () => {
    const pass = gradeWithManualScores(mixed, { m: "b" }, 70, {
      e: { points: 4, feedback: "" },
      c: { points: 2, feedback: "" },
    });
    expect(pass).toMatchObject({ score: 8, maxScore: 10, percent: 80, passed: true, pendingManual: false });
    expect(pass.results.find((x) => x.questionId === "e")).toEqual({ questionId: "e", correct: false, earned: 4 });

    const fail = gradeWithManualScores(mixed, { m: "a" }, 70, {
      e: { points: 5, feedback: "" },
      c: { points: 1, feedback: "" },
    });
    expect(fail).toMatchObject({ score: 6, maxScore: 10, percent: 60, passed: false });
  });

  it("handles an essay-only assessment and an exact pass-mark boundary", () => {
    const essayOnly = [q({ id: "e", type: "essay", points: 10 })];
    expect(gradeWithManualScores(essayOnly, {}, 70, { e: { points: 7, feedback: "" } })).toMatchObject({
      score: 7,
      maxScore: 10,
      percent: 70,
      passed: true,
    });
    expect(gradeWithManualScores(essayOnly, {}, 70, { e: { points: 0, feedback: "" } }).passed).toBe(false);
  });

  it("matches gradeAttempt when there are no manual questions", () => {
    const auto = [q({ id: "m", type: "mcq", correctOptionIds: ["b"] })];
    expect(gradeWithManualScores(auto, { m: "b" }, 70, {})).toEqual(gradeAttempt(auto, { m: "b" }, 70));
  });
});

describe("validateManualGrade", () => {
  const qs = [
    { id: "m", type: "mcq" as const, points: 2 },
    { id: "e", type: "essay" as const, points: 5 },
    { id: "c", type: "coding" as const, points: 3 },
  ];

  it("accepts whole points within bounds and trims feedback", () => {
    expect(
      validateManualGrade(qs, { points: { e: 5, c: 0 }, feedback: { e: "  Clear  " }, overall: " Well done " }),
    ).toEqual({
      ok: true,
      scores: { e: { points: 5, feedback: "Clear" }, c: { points: 0, feedback: "" } },
      feedback: "Well done",
    });
  });

  it("rejects missing, fractional, negative and out-of-range points", () => {
    for (const bad of [{ e: 5 }, { e: 2.5, c: 1 }, { e: -1, c: 1 }, { e: 6, c: 1 }, { e: "5", c: 1 }]) {
      expect(validateManualGrade(qs, { points: bad, feedback: {}, overall: "" }).ok).toBe(false);
    }
    expect(validateManualGrade(qs, { points: { e: 6, c: 1 }, feedback: {}, overall: "" })).toEqual({
      ok: false,
      error: "Question 2: enter a whole number of points from 0 to 5.",
    });
  });

  it("refuses to hand-score an auto-graded or unknown question", () => {
    expect(validateManualGrade(qs, { points: { e: 1, c: 1, m: 2 }, feedback: {}, overall: "" }).ok).toBe(false);
    expect(validateManualGrade(qs, { points: { e: 1, c: 1, x: 1 }, feedback: {}, overall: "" }).ok).toBe(false);
  });

  it("limits feedback length and tolerates malformed input", () => {
    const long = "x".repeat(5001);
    expect(validateManualGrade(qs, { points: { e: 1, c: 1 }, feedback: { e: long }, overall: "" }).ok).toBe(false);
    expect(validateManualGrade(qs, { points: { e: 1, c: 1 }, feedback: {}, overall: "y".repeat(10001) }).ok).toBe(false);
    expect(validateManualGrade(qs, { points: null, feedback: "nope", overall: 42 }).ok).toBe(false);
  });
});

describe("regradeBlockedReason", () => {
  it("only blocks turning a pass into a fail after the course was completed", () => {
    expect(regradeBlockedReason(true, false, true)).toMatch(/already completed the course/);
    expect(regradeBlockedReason(true, false, false)).toBeNull();
    expect(regradeBlockedReason(false, true, true)).toBeNull();
    expect(regradeBlockedReason(null, false, true)).toBeNull();
    expect(regradeBlockedReason(true, true, true)).toBeNull();
  });
});

describe("retry rules while an attempt awaits grading", () => {
  it("blocks a new attempt until the submitted one is graded", () => {
    expect(decideStart([{ status: "submitted", passed: null }], 3)).toEqual({ ok: false, reason: "awaiting_review" });
    expect(decideStart([{ status: "graded", passed: false }], 3)).toEqual({ ok: true, attemptNumber: 2 });
  });
});
