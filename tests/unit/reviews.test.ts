import { describe, expect, it } from "vitest";
import { distributionPercent, validateReview } from "@/features/reviews/reviews";

describe("validateReview", () => {
  it("accepts a rating with or without text and trims the text", () => {
    expect(validateReview({ rating: 5, body: "  Great  " })).toEqual({ ok: true, rating: 5, body: "Great" });
    expect(validateReview({ rating: 1, body: "" })).toEqual({ ok: true, rating: 1, body: "" });
  });

  it("rejects missing, fractional and out-of-range ratings", () => {
    for (const rating of [0, 6, 2.5, -1, "5", null, undefined, Number.NaN]) {
      expect(validateReview({ rating, body: "" })).toEqual({ ok: false, errors: { rating: "Choose a rating from 1 to 5 stars." } });
    }
  });

  it("rejects an over-long review but allows exactly the limit", () => {
    expect(validateReview({ rating: 3, body: "x".repeat(2001) })).toMatchObject({ ok: false, errors: { body: expect.stringContaining("2,000") } });
    expect(validateReview({ rating: 3, body: "x".repeat(2000) })).toMatchObject({ ok: true });
    expect(validateReview({ rating: 3, body: 12 })).toMatchObject({ ok: true, body: "" });
  });
});

describe("distributionPercent", () => {
  it("rounds shares and handles no reviews", () => {
    expect(distributionPercent({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    expect(distributionPercent({ 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 })).toEqual({ 1: 25, 2: 0, 3: 0, 4: 25, 5: 50 });
    expect(distributionPercent({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 })).toEqual({ 1: 0, 2: 0, 3: 33, 4: 0, 5: 67 });
  });
});
