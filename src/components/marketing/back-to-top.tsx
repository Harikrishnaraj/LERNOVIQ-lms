"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

// Floating back-to-top button for the public site (same behaviour as the static website: shown
// after scrolling down, smooth scroll to the top header, instant with reduced motion).
const SHOW_AFTER_PX = 400;

export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Back to top"
      title="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      className={cn(
        "fixed right-5 bottom-5 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-xl font-bold text-white shadow-[0_10px_24px_-10px_rgba(10,31,84,0.55)] transition-[opacity,transform,background-color,visibility] duration-200 hover:bg-primary-dark focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-primary motion-reduce:transition-none max-[600px]:right-3.5 max-[600px]:bottom-3.5 max-[600px]:size-11 max-[600px]:text-lg",
        visible ? "visible translate-y-0 opacity-100" : "invisible translate-y-2 opacity-0",
      )}
    >
      ↑
    </button>
  );
}
