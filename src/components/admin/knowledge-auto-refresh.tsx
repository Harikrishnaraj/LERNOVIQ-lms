"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** While sources are waiting to be indexed, re-reads the page every few seconds so statuses update. */
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
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}
