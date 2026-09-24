import { describe, expect, it } from "vitest";
import {
  formatCentsAsAmount,
  parseAmountToCents,
  unmetPrerequisites,
  validatePricing,
  wouldCreateCycle,
  type PricingInput,
} from "@/features/course-authoring/pricing-rules";

const base: PricingInput = {
  mode: "free",
  amount: "",
  currency: "USD",
  certificateEnabled: true,
  visibility: "public",
  prerequisiteIds: [],
};

describe("parseAmountToCents", () => {
  it("converts decimal strings without float errors", () => {
    expect(parseAmountToCents("49.99")).toBe(4999);
    expect(parseAmountToCents("49")).toBe(4900);
    expect(parseAmountToCents("49.9")).toBe(4990);
    expect(parseAmountToCents("0.10")).toBe(10);
    expect(parseAmountToCents("19.99")).toBe(1999);
    expect(parseAmountToCents(5)).toBe(500);
  });
  it("rejects junk, negatives, thousands separators and extra decimals", () => {
    for (const bad of ["", "abc", "-5", "1,000", "12.345", "1e3", ".5", "5.", "  ", "99999999"]) {
      expect(parseAmountToCents(bad), bad).toBeNull();
    }
  });
  it("round-trips through formatCentsAsAmount", () => {
    expect(formatCentsAsAmount(4999)).toBe("49.99");
    expect(formatCentsAsAmount(500)).toBe("5.00");
  });
});

describe("validatePricing", () => {
  it("accepts free (price forced to 0) and paid courses", () => {
    expect(validatePricing({ ...base, amount: "99" })).toMatchObject({ ok: true, value: { priceCents: 0 } });
    expect(validatePricing({ ...base, mode: "paid", amount: "49.99", currency: "EUR" })).toMatchObject({
      ok: true,
      value: { priceCents: 4999, currency: "EUR" },
    });
  });

  it("enforces the price range for paid courses", () => {
    expect(validatePricing({ ...base, mode: "paid", amount: "0.50" })).toMatchObject({ ok: false, errors: { amount: expect.stringContaining("minimum") } });
    expect(validatePricing({ ...base, mode: "paid", amount: "10000" })).toMatchObject({ ok: false, errors: { amount: expect.stringContaining("maximum") } });
    expect(validatePricing({ ...base, mode: "paid", amount: "abc" })).toMatchObject({ ok: false, errors: { amount: expect.any(String) } });
    expect(validatePricing({ ...base, mode: "paid", amount: "1.00" })).toMatchObject({ ok: true, value: { priceCents: 100 } });
  });

  it("rejects unknown mode, currency and visibility", () => {
    expect(validatePricing({ ...base, mode: "donation" })).toMatchObject({ ok: false, errors: { mode: expect.any(String) } });
    expect(validatePricing({ ...base, currency: "BTC" })).toMatchObject({ ok: false, errors: { currency: expect.any(String) } });
    expect(validatePricing({ ...base, visibility: "secret" })).toMatchObject({ ok: false, errors: { visibility: expect.any(String) } });
  });

  it("limits and de-duplicates prerequisites", () => {
    expect(validatePricing({ ...base, prerequisiteIds: ["a", "b"] })).toMatchObject({ ok: true, value: { prerequisiteIds: ["a", "b"] } });
    expect(validatePricing({ ...base, prerequisiteIds: ["a", "a"] })).toMatchObject({ ok: false });
    expect(validatePricing({ ...base, prerequisiteIds: ["a", "b", "c", "d", "e", "f"] })).toMatchObject({ ok: false });
  });

  it("keeps the certificate flag and visibility", () => {
    expect(validatePricing({ ...base, certificateEnabled: false, visibility: "unlisted" })).toMatchObject({
      ok: true,
      value: { certificateEnabled: false, visibility: "unlisted" },
    });
  });
});

describe("wouldCreateCycle", () => {
  const graph = new Map<string, string[]>([
    ["b", ["c"]],
    ["c", ["d"]],
  ]);
  it("detects direct and indirect loops", () => {
    expect(wouldCreateCycle("a", ["a"], graph)).toBe(true);
    expect(wouldCreateCycle("d", ["b"], graph)).toBe(true); // d -> b -> c -> d
    expect(wouldCreateCycle("c", ["b"], graph)).toBe(true);
  });
  it("allows acyclic requirements", () => {
    expect(wouldCreateCycle("a", ["b"], graph)).toBe(false);
    expect(wouldCreateCycle("a", ["b", "c", "d"], graph)).toBe(false);
    expect(wouldCreateCycle("a", [], graph)).toBe(false);
  });
  it("terminates on graphs that already contain a loop elsewhere", () => {
    const loopy = new Map<string, string[]>([["x", ["y"]], ["y", ["x"]]]);
    expect(wouldCreateCycle("a", ["x"], loopy)).toBe(false);
  });
});

describe("unmetPrerequisites", () => {
  it("lists the required courses that are not completed", () => {
    expect(unmetPrerequisites(["a", "b", "c"], new Set(["b"]))).toEqual(["a", "c"]);
    expect(unmetPrerequisites(["a"], new Set(["a"]))).toEqual([]);
    expect(unmetPrerequisites([], new Set())).toEqual([]);
  });
});
