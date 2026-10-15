import { describe, expect, it } from "vitest";
import {
  EMPTY_CART,
  MAX_SEATS,
  addItem,
  cartTotals,
  parseCart,
  removeItem,
  setSeats,
  type CartItem,
} from "@/features/cart/cart";

// T-263 (F-962): cart rules for the marketing site.
const course = (id: string, priceCents: number, currency = "USD"): Omit<CartItem, "seats"> => ({
  courseId: id,
  slug: id,
  title: `Course ${id}`,
  category: null,
  durationMinutes: 60,
  priceCents,
  currency,
  thumbnailUrl: null,
});

describe("cart", () => {
  it("adds a paid course once, with one seat, and ignores free courses", () => {
    let items = addItem([], course("a", 1000));
    items = addItem(items, course("a", 1000));
    items = addItem(items, course("free", 0));
    expect(items).toHaveLength(1);
    expect(items[0].seats).toBe(1);
  });

  it("removes a course and clamps seats to 1..MAX_SEATS", () => {
    let items = addItem(addItem([], course("a", 1000)), course("b", 500));
    items = setSeats(items, "a", 0);
    expect(items[0].seats).toBe(1);
    items = setSeats(items, "a", MAX_SEATS + 5);
    expect(items[0].seats).toBe(MAX_SEATS);
    items = setSeats(items, "a", 2.7);
    expect(items[0].seats).toBe(2);
    expect(removeItem(items, "a").map((i) => i.courseId)).toEqual(["b"]);
  });

  it("totals per currency; seats multiply only for a company", () => {
    let items = addItem(
      addItem(addItem([], course("a", 1000)), course("b", 500)),
      course("c", 20000, "INR"),
    );
    items = setSeats(items, "a", 3);
    expect(cartTotals({ items, buyer: "individual" })).toEqual({
      byCurrency: [
        ["USD", 1500],
        ["INR", 20000],
      ],
      seats: 3,
    });
    expect(cartTotals({ items, buyer: "company" })).toEqual({
      byCurrency: [
        ["USD", 3500],
        ["INR", 20000],
      ],
      seats: 5,
    });
  });

  it("treats malformed storage as an empty cart and drops bad items", () => {
    expect(parseCart(null)).toEqual(EMPTY_CART);
    expect(parseCart("{not json")).toEqual(EMPTY_CART);
    const parsed = parseCart(
      JSON.stringify({
        buyer: "company",
        items: [{ ...course("a", 1000), seats: -4 }, { courseId: 1 }],
      }),
    );
    expect(parsed.buyer).toBe("company");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].seats).toBe(1);
  });
});
