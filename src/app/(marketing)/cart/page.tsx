import type { Metadata } from "next";
import Link from "next/link";
import { CartView } from "@/components/marketing/cart-view";

// T-263 (F-962, ADR-042): cart from the design export (Cart.dc.html).
export const metadata: Metadata = { title: "Your cart", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="bg-landing-tint">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 pt-12 pb-24">
        <div className="flex flex-col gap-2">
          <Link href="/courses" className="text-sm font-bold text-primary-dark">
            ← Continue browsing
          </Link>
          <h1 className="text-[clamp(28px,3.4vw,40px)] font-extrabold tracking-[-0.02em]">Your cart</h1>
        </div>
        <CartView />
      </div>
    </div>
  );
}
