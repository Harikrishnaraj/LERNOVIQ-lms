"use client";

import Link from "next/link";
import { cartActions, cartTotals, lineSeats, useCart, type Buyer } from "@/features/cart/cart";
import { cn } from "@/lib/utils/cn";
import { formatDuration, formatPrice } from "@/lib/utils/format";

const BUYERS: [Buyer, string, string][] = [
  ["individual", "Myself", "One seat per course, linked to your LMS account."],
  ["company", "My company", "Buy seats for a team and assign them in the LMS."],
];

const field = "min-h-[46px] rounded-input border-[1.5px] border-landing-outline px-3 text-base font-normal";

// Cart from the design export (Cart.dc.html), T-263 (F-962). Checkout stays disabled until learner
// commerce ships with Dodo Payments (ADR-038, T-180); nothing here takes payment.
export function CartView() {
  const cart = useCart();
  const company = cart.buyer === "company";
  const { byCurrency, seats } = cartTotals(cart);
  const n = cart.items.length;
  const total = byCurrency.length ? byCurrency.map(([cur, cents]) => formatPrice(cents, cur)).join(" + ") : formatPrice(0);

  if (n === 0) {
    return (
      <div className="flex flex-col items-center gap-3.5 rounded-2xl border border-border bg-surface px-6 py-16 text-center">
        <h2 className="text-[22px] font-extrabold">Your cart is empty</h2>
        <p className="text-base text-neutral-text">Browse the catalogue and add the courses you want.</p>
        <Link href="/courses" className="flex min-h-12 items-center rounded-input bg-primary px-[22px] text-[15px] font-bold text-white hover:bg-primary-dark">
          Browse courses
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5">
          <h2 className="text-[15px] font-extrabold">Who is this for?</h2>
          <div role="radiogroup" aria-label="Buyer type" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-2.5">
            {BUYERS.map(([k, label, desc]) => {
              const on = k === cart.buyer;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => cartActions.setBuyer(k)}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-xl border-[1.5px] p-4 text-left",
                    on ? "border-primary bg-primary-light" : "border-border bg-surface",
                  )}
                >
                  <span className="text-base font-extrabold">{label}</span>
                  <span className="text-sm leading-[1.5] text-neutral-text">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>

        <ul aria-label="Cart items" className="flex flex-col gap-3">
          {cart.items.map((item) => {
            const s = lineSeats(item, cart.buyer);
            const seatId = `seats-${item.courseId}`;
            return (
              <li key={item.courseId} className="flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-4">
                {item.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- user-uploaded, remote storage host
                  <img src={item.thumbnailUrl} alt="" className="aspect-[16/10] w-[120px] shrink-0 rounded-input bg-primary-light object-cover" />
                ) : (
                  <span className="aspect-[16/10] w-[120px] shrink-0 rounded-input bg-primary-light" aria-hidden="true" />
                )}
                <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
                  {item.category && <span className="text-xs font-bold text-neutral-text">{item.category}</span>}
                  <h3 className="text-base leading-[1.35] font-bold">
                    <Link href={`/courses/${item.slug}`} className="hover:text-primary-dark">{item.title}</Link>
                  </h3>
                  <span className="text-[13px] text-neutral-text">{formatDuration(item.durationMinutes)}</span>
                </div>
                {company && (
                  <div className="flex flex-col items-start gap-1">
                    <span id={seatId} className="text-xs font-bold text-neutral-text">Seats</span>
                    <div role="group" aria-labelledby={seatId} className="flex items-center overflow-hidden rounded-input border-[1.5px] border-landing-outline">
                      <button type="button" onClick={() => cartActions.setSeats(item.courseId, item.seats - 1)} aria-label="Fewer seats" className="size-10 cursor-pointer bg-surface text-lg">
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={item.seats}
                        onChange={(e) => cartActions.setSeats(item.courseId, Number.parseInt(e.target.value || "1", 10))}
                        aria-label={`Seats for ${item.title}`}
                        className="h-10 w-16 border-x border-border text-center text-[15px] font-bold"
                      />
                      <button type="button" onClick={() => cartActions.setSeats(item.courseId, item.seats + 1)} aria-label="More seats" className="size-10 cursor-pointer bg-surface text-lg">
                        +
                      </button>
                    </div>
                  </div>
                )}
                <div className="ml-auto flex min-w-[110px] flex-col items-end gap-1.5">
                  <span className="text-[17px] font-extrabold">{formatPrice(item.priceCents * s, item.currency)}</span>
                  {company && <span className="text-xs text-neutral-text">{formatPrice(item.priceCents, item.currency)} / seat</span>}
                  <button
                    type="button"
                    onClick={() => cartActions.remove(item.courseId)}
                    aria-label={`Remove ${item.title}`}
                    className="cursor-pointer py-1.5 text-sm font-bold text-danger-text"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        {company && (
          <div className="flex flex-col gap-3.5 rounded-card border border-border bg-surface p-5">
            <h2 className="text-[15px] font-extrabold">Company details</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3.5">
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                Company name
                <input name="company" autoComplete="organization" maxLength={160} className={field} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-bold">
                <span>
                  GSTIN <span className="text-[13px] font-medium text-neutral-text">(optional, for a GST invoice)</span>
                </span>
                <input name="gstin" maxLength={15} pattern="[0-9A-Za-z]{15}" className={`${field} uppercase`} />
              </label>
            </div>
            <p className="text-[13px] leading-[1.6] text-neutral-text">
              Seats are assigned to learners from the LMS admin after payment. Need over 100 seats or invoicing
              on credit?{" "}
              <Link href="/contact" className="font-bold text-primary-dark underline">
                Contact us
              </Link>
              .
            </p>
          </div>
        )}
      </div>

      <aside aria-label="Order summary" className="sticky top-4 flex min-w-[280px] flex-[1_1_320px] flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-lg font-extrabold">Order summary</h2>
        <dl className="flex flex-col gap-2.5 text-[15px]">
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-text">
              {n} {n === 1 ? "course" : "courses"}
              {company && ` · ${seats} seats`}
            </dt>
            <dd className="font-bold">{total}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-neutral-text">Taxes</dt>
            <dd className="text-neutral-text">Calculated at payment</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-3 text-lg">
            <dt className="font-extrabold">Total</dt>
            <dd className="font-extrabold">{total}</dd>
          </div>
        </dl>
        <button type="button" disabled aria-describedby="checkout-note" className="min-h-[54px] rounded-input bg-primary text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Checkout
        </button>
        <p id="checkout-note" role="note" className="rounded-input border border-warning bg-warning-light px-3.5 py-3 text-sm leading-[1.5] text-warning-text">
          Online payment is not available yet. Your cart is saved on this device; to buy now,{" "}
          <Link href="/contact" className="font-bold underline">contact us</Link>.
        </p>
        <ol className="flex flex-col gap-2.5 text-sm leading-[1.5] text-landing-body">
          {[
            <>
              <Link href="/login" className="font-bold text-primary-dark">Log in</Link> or{" "}
              <Link href="/signup" className="font-bold text-primary-dark">sign up</Link> to LERNOVIQ LMS
            </>,
            <>Pay securely online (coming soon)</>,
            <>Courses appear in My Learning straight away</>,
          ].map((content, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary-light text-xs font-extrabold text-primary-dark">{i + 1}</span>
              <span>{content}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
