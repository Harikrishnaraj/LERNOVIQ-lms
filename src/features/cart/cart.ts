// Marketing-site cart (T-263, F-962, ADR-042). Lives in the visitor's localStorage until learner
// commerce ships (ADR-038, T-180): items are a snapshot taken when added, so checkout must re-price
// server-side. Pure functions here are unit-tested; the store below only adds persistence.
import { useSyncExternalStore } from "react";

export const MAX_SEATS = 10_000;

export interface CartItem {
  courseId: string;
  slug: string;
  title: string;
  category: string | null;
  durationMinutes: number;
  priceCents: number;
  currency: string;
  thumbnailUrl: string | null;
  seats: number;
}

export type Buyer = "individual" | "company";

export interface CartState {
  items: CartItem[];
  buyer: Buyer;
}

export const EMPTY_CART: CartState = { items: [], buyer: "individual" };

export function addItem(items: CartItem[], item: Omit<CartItem, "seats">): CartItem[] {
  if (item.priceCents <= 0 || items.some((i) => i.courseId === item.courseId)) return items;
  return [...items, { ...item, seats: 1 }];
}

export function removeItem(items: CartItem[], courseId: string): CartItem[] {
  return items.filter((i) => i.courseId !== courseId);
}

export function clampSeats(n: number): number {
  return Number.isFinite(n) ? Math.min(MAX_SEATS, Math.max(1, Math.trunc(n))) : 1;
}

export function setSeats(items: CartItem[], courseId: string, seats: number): CartItem[] {
  return items.map((i) => (i.courseId === courseId ? { ...i, seats: clampSeats(seats) } : i));
}

/** Seats count only for a company purchase; a person buys one seat per course. */
export function lineSeats(item: CartItem, buyer: Buyer): number {
  return buyer === "company" ? item.seats : 1;
}

/** Totals per currency (courses keep their own currency), in minor units, plus total seats. */
export function cartTotals(state: CartState): { byCurrency: [string, number][]; seats: number } {
  const sums = new Map<string, number>();
  let seats = 0;
  for (const item of state.items) {
    const n = lineSeats(item, state.buyer);
    seats += n;
    sums.set(item.currency, (sums.get(item.currency) ?? 0) + item.priceCents * n);
  }
  return { byCurrency: [...sums.entries()], seats };
}

/** Anything malformed in storage (old versions, hand edits) becomes an empty cart, never a crash. */
export function parseCart(raw: string | null): CartState {
  if (!raw) return EMPTY_CART;
  try {
    const v = JSON.parse(raw) as Partial<CartState>;
    const items = Array.isArray(v.items)
      ? v.items
          .filter(
            (i): i is CartItem =>
              !!i &&
              typeof i.courseId === "string" &&
              typeof i.slug === "string" &&
              typeof i.title === "string" &&
              typeof i.priceCents === "number" &&
              typeof i.currency === "string",
          )
          .map((i) => ({ ...i, seats: clampSeats(i.seats) }))
      : [];
    return { items, buyer: v.buyer === "company" ? "company" : "individual" };
  } catch {
    return EMPTY_CART;
  }
}

/* ---------- browser store ---------- */

const KEY = "lernoviq_cart_v1";
const EVENT = "lernoviq-cart";
let cachedRaw: string | null | undefined;
let cachedState = EMPTY_CART;

function read(): CartState {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // storage blocked (private mode): behave as an empty cart
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseCart(raw);
  }
  return cachedState;
}

function write(next: CartState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore: the cart just won't persist
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCart(): CartState {
  return useSyncExternalStore(subscribe, read, () => EMPTY_CART);
}

export const cartActions = {
  add: (item: Omit<CartItem, "seats">) => write({ ...read(), items: addItem(read().items, item) }),
  remove: (courseId: string) => write({ ...read(), items: removeItem(read().items, courseId) }),
  setSeats: (courseId: string, seats: number) =>
    write({ ...read(), items: setSeats(read().items, courseId, seats) }),
  setBuyer: (buyer: Buyer) => write({ ...read(), buyer }),
};
