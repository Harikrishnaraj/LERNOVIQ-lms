import { describe, expect, it } from "vitest";
import { sanitizeAnswers, type AnswerableQuestion } from "@/features/assessments/answers";

const qs: AnswerableQuestion[] = [
  { id: "m", type: "mcq", optionIds: ["a", "b"] },
  { id: "x", type: "multi", optionIds: ["a", "b", "c"] },
  { id: "s", type: "short_answer", optionIds: [] },
  { id: "e", type: "essay", optionIds: [] },
];

describe("sanitizeAnswers", () => {
  it("keeps valid answers", () => {
    expect(sanitizeAnswers(qs, { m: "a", x: ["a", "c"], s: "paris", e: "text" })).toEqual({
      m: "a",
      x: ["a", "c"],
      s: "paris",
      e: "text",
    });
  });

  it("drops unknown questions and options that do not belong to the question", () => {
    expect(sanitizeAnswers(qs, { zzz: "a", m: "not-an-option", x: ["a", "nope", "a"] })).toEqual({
      x: ["a"],
    });
  });

  it("drops wrong shapes", () => {
    expect(sanitizeAnswers(qs, { m: ["a"], x: "a", s: 5, e: { a: 1 } })).toEqual({});
  });

  it("bounds text length", () => {
    const out = sanitizeAnswers(qs, { s: "x".repeat(900), e: "y".repeat(9000) });
    expect((out.s as string).length).toBe(500);
    expect((out.e as string).length).toBe(5000);
  });

  it("returns nothing for non-object input", () => {
    for (const bad of [null, undefined, "x", 5, ["a"]]) expect(sanitizeAnswers(qs, bad)).toEqual({});
  });
});
