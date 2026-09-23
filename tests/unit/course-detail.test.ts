import { describe, expect, it } from "vitest";
import { descriptionParagraphs } from "@/features/catalog/course-detail";

describe("descriptionParagraphs", () => {
  it("splits on blank lines and drops empties", () => {
    expect(descriptionParagraphs("One.\n\n\nTwo.\n\n  \nThree.")).toEqual([
      "One.",
      "Two.",
      "Three.",
    ]);
  });
  it("returns nothing for an empty description", () => {
    expect(descriptionParagraphs("")).toEqual([]);
  });
});
