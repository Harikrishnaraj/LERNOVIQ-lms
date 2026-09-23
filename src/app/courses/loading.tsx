import { Skeleton } from "@/components/ui/skeleton";

export default function CatalogLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading courses…</span>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-32" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
