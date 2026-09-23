import { cn } from "@/lib/utils/cn";

/** Loading placeholder. Wrap groups in an element with aria-busy="true". */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden="true" className={cn("animate-pulse rounded-control bg-border", className)} />
  );
}
