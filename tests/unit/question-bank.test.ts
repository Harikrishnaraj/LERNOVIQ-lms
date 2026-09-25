import { describe, expect, it } from "vitest";
import { parseBankQuery, parseTags, toEditorQuestion, type BankItem } from "@/features/question-bank/bank";

describe("parseTags", () => {
  it("lowercases, trims, dashes spaces and drops blanks and duplicates", () => {
    expect(parseTags(" Algebra, Week 1 ,algebra,, C# ")).toEqual({ ok: true, tags: ["algebra", "week-1", "c#"] });
    expect(parseTags("a\nb")).toEqual({ ok: true, tags: ["a", "b"] });
    expect(parseTags(["X", "x", "y"])).toEqual({ ok: true, tags: ["x", "y"] });
    expect(parseTags("")).toEqual({ ok: true, tags: [] });
  });

  it("rejects too many, too long and odd tags", () => {
    expect(parseTags("a,b,c,d,e,f,g,h,i")).toEqual({ ok: false, error: "Use at most 8 tags." });
    expect(parseTags("x".repeat(31))).toEqual({ ok: false, error: "Keep each tag under 30 characters." });
    expect(parseTags("bad<tag>")).toMatchObject({ ok: false });
    expect(parseTags("-leading")).toMatchObject({ ok: false });
    expect(parseTags("x".repeat(30))).toMatchObject({ ok: true });
  });
});

describe("parseBankQuery", () => {
  it("defaults and ignores unknown types", () => {
    expect(parseBankQuery({})).toEqual({ q: "", tag: "", type: "" });
    expect(parseBankQuery({ type: "bogus", q: "  hi  ", tag: " Algebra " })).toEqual({ q: "hi", tag: "algebra", type: "" });
    expect(parseBankQuery({ type: "mcq" }).type).toBe("mcq");
    expect(parseBankQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("toEditorQuestion", () => {
  it("maps a bank item to the editor shape", () => {
    const item: BankItem = {
      id: "b1", type: "mcq", prompt: "P", points: 2, tags: ["t"], explanation: "E", acceptedAnswers: [],
      options: [{ label: "A", correct: true }, { label: "B", correct: false }], updatedAt: "2026-01-01",
    };
    expect(toEditorQuestion(item)).toEqual({
      id: "b1", type: "mcq", prompt: "P", points: 2, position: 0, explanation: "E", acceptedAnswers: [],
      options: [{ id: "b1-0", label: "A", correct: true }, { id: "b1-1", label: "B", correct: false }],
    });
  });
});
