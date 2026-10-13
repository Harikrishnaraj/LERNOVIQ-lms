"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * While sources are waiting to be indexed, re-reads the page every few seconds so statuses update,
 * pausing while the tab is hidden or a form has focus.
 */
export function KnowledgeAutoRefresh({
  active,
  everyMs = 5000,
}: {
  active: boolean;
  everyMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      // Skip a beat while the tab is hidden or the admin is typing or clicking in a form: a
      // refresh then would shift the layout under them (and wastes requests in the background).
      if (document.hidden) return;
      const focused = document.activeElement;
      if (focused && focused !== document.body && focused.closest("form")) return;
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}
