"use client";

import Link from "next/link";
import { cartActions, useCart, type CartItem } from "@/features/cart/cart";

// "Add to cart" / "✓ In cart" from the design export; free courses link to the course instead.
export function AddToCartButton({ course }: { course: Omit<CartItem, "seats"> }) {
  const { items } = useCart();
  const base = "flex min-h-[42px] items-center rounded-input px-3.5 text-sm font-bold whitespace-nowrap";

  if (course.priceCents <= 0) {
    return (
      <Link href={`/courses/${course.slug}`} className={`${base} border-[1.5px] border-landing-outline text-text hover:border-primary hover:text-primary-dark`}>
        Enroll free
      </Link>
    );
  }
  if (items.some((i) => i.courseId === course.courseId)) {
    return (
      <Link href="/cart" className={`${base} bg-success-light text-success-text`}>
        ✓ In cart
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => cartActions.add(course)}
      aria-label={`Add ${course.title} to cart`}
      className={`${base} cursor-pointer bg-primary text-white hover:bg-primary-dark`}
    >
      Add to cart
    </button>
  );
}
