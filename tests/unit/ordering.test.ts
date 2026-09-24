import { describe, expect, it } from "vitest";
import { isPermutation, moveBy, moveItem, nextPosition } from "@/features/course-authoring/ordering";

describe("moveItem", () => {
  it("moves an item to a new index without mutating the input", () => {
    const input = ["a", "b", "c", "d"];
    expect(moveItem(input, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(input, 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(input).toEqual(["a", "b", "c", "d"]);
  });
  it("clamps out-of-range targets and ignores bad sources", () => {
    expect(moveItem(["a", "b"], 0, 99)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 1, -5)).toEqual(["b", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});

describe("moveBy", () => {
  it("moves one step up or down", () => {
    expect(moveBy(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveBy(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });
  it("does nothing at the edges or for unknown ids", () => {
    expect(moveBy(["a", "b"], "a", -1)).toEqual(["a", "b"]);
    expect(moveBy(["a", "b"], "b", 1)).toEqual(["a", "b"]);
    expect(moveBy(["a", "b"], "zzz", 1)).toEqual(["a", "b"]);
  });
});

describe("isPermutation", () => {
  it("accepts any reordering of the same ids", () => {
    expect(isPermutation(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    expect(isPermutation([], [])).toBe(true);
  });
  it("rejects missing, extra, duplicated and foreign ids", () => {
    expect(isPermutation(["a", "b"], ["a"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "a"])).toBe(false);
    expect(isPermutation(["a", "b"], ["a", "x"])).toBe(false);
  });
});

describe("nextPosition", () => {
  it("appends after the highest position", () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([0, 1, 2])).toBe(3);
    expect(nextPosition([4, 1])).toBe(5);
  });
});
