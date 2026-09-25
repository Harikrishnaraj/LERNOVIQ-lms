import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_LABEL, isCategory, safeHref } from "@/features/notifications/notifications";

describe("safeHref", () => {
  it("allows same-origin paths only", () => {
    expect(safeHref("/learner/assignments/1")).toBe("/learner/assignments/1");
    expect(safeHref("https://evil.example.com")).toBeNull();
    expect(safeHref("//evil.example.com")).toBeNull();
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });
});

describe("categories", () => {
  it("recognises known categories and has a label for each", () => {
    for (const c of CATEGORIES) {
      expect(isCategory(c)).toBe(true);
      expect(CATEGORY_LABEL[c].label.length).toBeGreaterThan(2);
    }
    expect(isCategory("spam")).toBe(false);
    expect(isCategory(1)).toBe(false);
  });
});
