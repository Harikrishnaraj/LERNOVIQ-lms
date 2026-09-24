import { describe, expect, it } from "vitest";
import {
  summarizeQuestions,
  validateQuestion,
  validateSettings,
  type QuestionInput,
} from "@/features/course-authoring/assessment-rules";

const q = (over: Partial<QuestionInput>): QuestionInput => ({
  type: "mcq",
  prompt: "Which one?",
  points: 1,
  options: [
    { label: "A", correct: true },
    { label: "B", correct: false },
  ],
  acceptedAnswers: [],
  explanation: "",
  ...over,
});

describe("validateQuestion: multiple choice", () => {
  it("accepts one correct option among 2 to 8", () => {
    const r = validateQuestion(q({}));
    expect(r).toMatchObject({ ok: true, value: { type: "mcq", points: 1 } });
  });

  it("requires exactly one correct answer", () => {
    const none = validateQuestion(q({ options: [{ label: "A", correct: false }, { label: "B", correct: false }] }));
    const two = validateQuestion(q({ options: [{ label: "A", correct: true }, { label: "B", correct: true }] }));
    expect(none).toMatchObject({ ok: false, errors: { options: "Mark exactly one option as correct." } });
    expect(two).toMatchObject({ ok: false, errors: { options: "Mark exactly one option as correct." } });
  });

  it("enforces option count, text and uniqueness", () => {
    expect(validateQuestion(q({ options: [{ label: "A", correct: true }] }))).toMatchObject({ ok: false });
    const nine = Array.from({ length: 9 }, (_, i) => ({ label: `o${i}`, correct: i === 0 }));
    expect(validateQuestion(q({ options: nine }))).toMatchObject({ ok: false });
    expect(validateQuestion(q({ options: [{ label: " ", correct: true }, { label: "B", correct: false }] }))).toMatchObject({ ok: false });
    expect(validateQuestion(q({ options: [{ label: "Same", correct: true }, { label: "same", correct: false }] }))).toMatchObject({
      ok: false,
      errors: { options: "Answer options must be different from each other." },
    });
  });

  it("trims labels and the prompt", () => {
    const r = validateQuestion(q({ prompt: "  Q?  ", options: [{ label: " A ", correct: true }, { label: " B ", correct: false }] }));
    expect(r).toMatchObject({ ok: true, value: { prompt: "Q?", options: [{ label: "A", correct: true }, { label: "B", correct: false }] } });
  });
});

describe("validateQuestion: multiple select", () => {
  it("needs at least one correct option but allows several", () => {
    const opts = [
      { label: "A", correct: true },
      { label: "B", correct: true },
      { label: "C", correct: false },
    ];
    expect(validateQuestion(q({ type: "multi", options: opts }))).toMatchObject({ ok: true });
    expect(validateQuestion(q({ type: "multi", options: opts.map((o) => ({ ...o, correct: false })) }))).toMatchObject({
      ok: false,
      errors: { options: "Mark at least one option as correct." },
    });
  });
});

describe("validateQuestion: true / false", () => {
  const tf = (a: boolean, b: boolean) => [
    { label: "True", correct: a },
    { label: "False", correct: b },
  ];
  it("needs the fixed True/False options and exactly one correct", () => {
    expect(validateQuestion(q({ type: "true_false", options: tf(true, false) }))).toMatchObject({ ok: true });
    expect(validateQuestion(q({ type: "true_false", options: tf(false, false) }))).toMatchObject({ ok: false });
    expect(validateQuestion(q({ type: "true_false", options: tf(true, true) }))).toMatchObject({ ok: false });
    expect(validateQuestion(q({ type: "true_false", options: [{ label: "Yes", correct: true }, { label: "No", correct: false }] }))).toMatchObject({ ok: false });
  });
});

describe("validateQuestion: short answer", () => {
  it("needs at least one accepted answer; blanks and case-insensitive duplicates are dropped", () => {
    expect(validateQuestion(q({ type: "short_answer", options: [], acceptedAnswers: [] }))).toMatchObject({
      ok: false,
      errors: { acceptedAnswers: "Add at least one accepted answer." },
    });
    const r = validateQuestion(q({ type: "short_answer", options: [], acceptedAnswers: [" Paris ", "", "paris", "The city of Paris"] }));
    expect(r).toMatchObject({ ok: true, value: { acceptedAnswers: ["Paris", "The city of Paris"], options: [] } });
  });
  it("caps the number and length of accepted answers", () => {
    expect(validateQuestion(q({ type: "short_answer", options: [], acceptedAnswers: Array.from({ length: 11 }, (_, i) => `a${i}`) }))).toMatchObject({ ok: false });
    expect(validateQuestion(q({ type: "short_answer", options: [], acceptedAnswers: ["x".repeat(201)] }))).toMatchObject({ ok: false });
  });
});

describe("validateQuestion: essay and coding", () => {
  it("need no options or key and drop any that were sent", () => {
    for (const type of ["essay", "coding"]) {
      const r = validateQuestion(q({ type, points: 10, options: [{ label: "junk", correct: true }], acceptedAnswers: ["junk"] }));
      expect(r).toMatchObject({ ok: true, value: { type, points: 10, options: [], acceptedAnswers: [] } });
    }
  });
});

describe("validateQuestion: shared fields", () => {
  it("rejects unknown types, empty prompts and bad points", () => {
    expect(validateQuestion(q({ type: "matching" }))).toMatchObject({ ok: false, errors: { type: expect.any(String) } });
    expect(validateQuestion(q({ prompt: "  " }))).toMatchObject({ ok: false, errors: { prompt: "Write the question." } });
    for (const points of [0, -1, 1.5, 101, NaN]) {
      expect(validateQuestion(q({ points })), String(points)).toMatchObject({ ok: false, errors: { points: expect.any(String) } });
    }
  });
  it("caps the prompt and explanation length", () => {
    expect(validateQuestion(q({ prompt: "x".repeat(5001) }))).toMatchObject({ ok: false });
    expect(validateQuestion(q({ explanation: "x".repeat(2001) }))).toMatchObject({ ok: false });
  });
  it("reports several problems at once", () => {
    const r = validateQuestion(q({ prompt: "", points: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["points", "prompt"]);
  });
});

describe("validateSettings", () => {
  const ok = { title: "Final", description: "", passMark: 70, maxAttempts: 3 as number | null, timeLimitMinutes: 30 as number | null };
  it("accepts valid settings, including unlimited attempts and no time limit", () => {
    expect(validateSettings(ok)).toMatchObject({ ok: true });
    expect(validateSettings({ ...ok, maxAttempts: null, timeLimitMinutes: null })).toMatchObject({ ok: true });
    expect(validateSettings({ ...ok, passMark: 0 })).toMatchObject({ ok: true });
    expect(validateSettings({ ...ok, passMark: 100 })).toMatchObject({ ok: true });
  });
  it("rejects out-of-range and non-integer values", () => {
    expect(validateSettings({ ...ok, title: " " })).toMatchObject({ ok: false, errors: { title: "Enter a title." } });
    for (const passMark of [-1, 101, 70.5, NaN]) expect(validateSettings({ ...ok, passMark })).toMatchObject({ ok: false, errors: { passMark: expect.any(String) } });
    for (const maxAttempts of [0, 21, 1.5]) expect(validateSettings({ ...ok, maxAttempts })).toMatchObject({ ok: false, errors: { maxAttempts: expect.any(String) } });
    for (const timeLimitMinutes of [0, 601, 2.5]) expect(validateSettings({ ...ok, timeLimitMinutes })).toMatchObject({ ok: false, errors: { timeLimitMinutes: expect.any(String) } });
  });
});

describe("summarizeQuestions", () => {
  it("separates auto-graded from hand-graded points", () => {
    expect(
      summarizeQuestions([
        { type: "mcq", points: 2 },
        { type: "short_answer", points: 1 },
        { type: "essay", points: 5 },
        { type: "coding", points: 10 },
      ]),
    ).toEqual({ count: 4, totalPoints: 18, autoPoints: 3, manualCount: 2 });
    expect(summarizeQuestions([])).toEqual({ count: 0, totalPoints: 0, autoPoints: 0, manualCount: 0 });
  });
});
