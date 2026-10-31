"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useCart } from "@/features/cart/cart";
import { cn } from "@/lib/utils/cn";

// Site header from the design export (SiteHeader.dc.html, ADR-042). Below 1440px the nav takes its
// own row; below md it collapses into a Menu drawer (native <details>, closed on navigation).
export const SITE_NAV = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Solutions", href: "/solutions" },
  { label: "Courses", href: "/courses" },
  { label: "LERNOVIQ LMS", href: "/lms" },
  { label: "Industries", href: "/industries" },
  { label: "Delivery", href: "/delivery" },
  { label: "FAQs", href: "/faqs" },
];

const isCurrent = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

// Prefetch is off for site chrome: ~20 links on every page made production builds fetch every
// marketing page in the background, keeping pages busy (and E2E waits for idle never finishing).
export function SiteHeader({ portalHref }: { portalHref: string | null }) {
  const pathname = usePathname();
  const { items } = useCart();
  const count = items.length;
  const drawer = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (drawer.current) drawer.current.open = false;
  }, [pathname]);

  const navLink = (current: boolean) =>
    cn(
      "rounded-control font-semibold whitespace-nowrap hover:bg-primary-light hover:text-primary-dark",
      current ? "bg-primary-light text-primary-dark" : "text-text",
    );
  const signup =
    "rounded-input border-[1.5px] border-primary bg-surface font-bold whitespace-nowrap text-primary-dark hover:bg-primary-light";
  const cartLink = (
    <Link
      prefetch={false}
      href="/cart"
      aria-label={count ? `Cart, ${count} ${count === 1 ? "course" : "courses"}` : "Cart, empty"}
      aria-current={pathname === "/cart" ? "page" : undefined}
      className={cn(
        "relative flex size-[46px] items-center justify-center rounded-input border-[1.5px] border-landing-outline hover:border-primary",
        pathname === "/cart" ? "bg-primary-light" : "bg-surface",
      )}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2M9 20a1 1 0 1 0 0-2a1 1 0 0 0 0 2zM17 20a1 1 0 1 0 0-2a1 1 0 0 0 0 2z" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-primary px-[5px] text-[11px] font-extrabold text-white"
          aria-hidden="true"
        >
          {count}
        </span>
      )}
    </Link>
  );

  return (
    <header className="relative z-20 border-b border-border bg-surface font-display text-text">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-5 gap-y-1 px-6 py-1.5">
        <Link
          prefetch={false}
          href="/"
          aria-label="LERNOVIQ home"
          className="shrink-0 rounded-control"
        >
          {/* Brand guide §5: the compact secondary mark on small screens, the primary lockup from md up. */}
          <BrandLogo variant="secondary" width={96} className="md:hidden" />
          <BrandLogo width={120} className="hidden md:inline-block" />
        </Link>

        <nav
          aria-label="Primary"
          className="order-3 hidden basis-full flex-wrap items-center justify-start gap-1 border-t border-border-subtle py-1.5 min-[1440px]:order-none min-[1440px]:basis-auto min-[1440px]:justify-center min-[1440px]:border-t-0 min-[1440px]:py-0 md:flex"
        >
          {SITE_NAV.map((l) => {
            const current = isCurrent(pathname, l.href);
            return (
              <Link
                prefetch={false}
                key={l.href}
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={cn("px-3 py-2.5 text-[15px]", navLink(current))}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {cartLink}
          {portalHref ? (
            <Link
              prefetch={false}
              href={portalHref}
              className={cn("px-4 py-[11px] text-[15px]", signup)}
            >
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                prefetch={false}
                href="/login"
                className="rounded-input px-3.5 py-3 text-[15px] font-bold whitespace-nowrap hover:bg-primary-light hover:text-primary-dark"
              >
                Log in
              </Link>
              <Link
                prefetch={false}
                href="/signup"
                className={cn("px-4 py-[11px] text-[15px]", signup)}
              >
                Sign up
              </Link>
            </>
          )}
          <Link
            prefetch={false}
            href="/contact"
            className="rounded-input bg-primary px-5 py-[13px] text-[15px] font-bold whitespace-nowrap text-white hover:bg-primary-dark"
          >
            Discuss Your Learning Needs
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {cartLink}
          <details ref={drawer} className="group">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 rounded-input border-[1.5px] border-landing-outline bg-surface px-4 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
              <span className="flex flex-col gap-1" aria-hidden="true">
                <span className="h-0.5 w-[18px] bg-text" />
                <span className="h-0.5 w-[18px] bg-text" />
                <span className="h-0.5 w-[18px] bg-text" />
              </span>
              <span className="group-open:hidden">Menu</span>
              <span className="hidden group-open:inline">Close</span>
            </summary>
            <nav
              aria-label="Primary"
              className="absolute inset-x-0 top-full flex flex-col gap-1 border-t border-border bg-surface px-6 pt-3 pb-6 shadow-lg"
            >
              {SITE_NAV.map((l) => {
                const current = isCurrent(pathname, l.href);
                return (
                  <Link
                    prefetch={false}
                    key={l.href}
                    href={l.href}
                    aria-current={current ? "page" : undefined}
                    className={cn("flex min-h-12 items-center px-3.5 text-base", navLink(current))}
                  >
                    {l.label}
                  </Link>
                );
              })}
              {portalHref ? (
                <Link
                  prefetch={false}
                  href={portalHref}
                  className={cn(
                    "mt-3 flex min-h-[52px] items-center justify-center text-base",
                    signup,
                  )}
                >
                  Go to dashboard
                </Link>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2.5">
                  <Link
                    prefetch={false}
                    href="/login"
                    className="flex min-h-[52px] items-center justify-center rounded-input border-[1.5px] border-landing-outline text-base font-bold"
                  >
                    Log in
                  </Link>
                  <Link
                    prefetch={false}
                    href="/signup"
                    className={cn(
                      "flex min-h-[52px] items-center justify-center text-base",
                      signup,
                    )}
                  >
                    Sign up
                  </Link>
                </div>
              )}
              <Link
                prefetch={false}
                href="/contact"
                className="mt-1 flex min-h-[52px] items-center justify-center rounded-input bg-primary text-base font-bold text-white"
              >
                Discuss Your Learning Needs
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
