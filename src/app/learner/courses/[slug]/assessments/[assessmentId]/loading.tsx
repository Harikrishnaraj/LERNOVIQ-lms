import { Skeleton } from "@/components/ui/skeleton";

export default function AssessmentLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <span className="sr-only">Loading assessment…</span>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
  );
}
